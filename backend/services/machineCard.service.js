// services/machineCard.service.js
// Client cards from VALD machine tests (scoring/machineCard.js): VALD Hub PDF
// tests in, the report content the card renders out. Saved reports without
// statSet "machine_v1" keep their old cards.

const { matchName, VALD_BAND_LABEL, VALD_BAND_WORDS, ordinal, percentileWords } = require('./vald/valdHubPdf');
const { scoreMachineCard, loadMachineConfig, generalBattery, throughAnchors } = require('../scoring/machineCard');
const { loadConfig, pyRound } = require('../scoring/scoring');
const { ALL_TEST_INFO, SPORT_PROFILES } = require('./scoredReport.service');

const isSet = (v) => v !== undefined && v !== null;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

// Clients with no sport: General / Gym (its Dynamo tests are in machine_card_v1.json).
const GENERAL = { key: 'general', displayName: 'General / Gym' };
const SPORTS = ['football', 'padel', 'cricket', 'general'];

// Card stat names, in card order. Speed is the locked slot.
const STAT_NAMES = { strength: 'Strength', symmetry: 'Symmetry', balance: 'Balance', movement: 'Movement', mobility: 'Mobility', speed: 'Speed' };
const CARD_ORDER = ['strength', 'symmetry', 'balance', 'movement', 'mobility', 'speed'];

/** Parsed VALD Hub PDF (valdHubPdf.parsePages) -> machine card input tests. */
const machineTestsFromPdf = (parsed) => parsed.tests.map(t => {
  const keys = matchName(t.test);
  const key = keys.length === 1 ? keys[0] : /arc of motion/i.test(t.test) ? 'arc_of_motion' : null;
  const label = key && ALL_TEST_INFO[key] ? ALL_TEST_INFO[key].label : key === 'arc_of_motion' ? 'Shoulder Arc of Motion' : t.test;
  return {
    key, label, device: t.device, unit: t.results.find(r => r.unit)?.unit || '',
    sides: Object.fromEntries(t.results.map(r => [r.side, { value: r.value, percentile: r.percentile, band: r.band ? VALD_BAND_LABEL[r.band] : null }]))
  };
});

const fmt = (v, unit) => (isSet(v) ? `${v}${unit === '°' ? '°' : ` ${unit}`}` : '—');
const sideText = (t) => (t.sides.value ? String(t.sides.value.value ?? '—') : `L ${t.sides.left?.value ?? '—'} · R ${t.sides.right?.value ?? '—'}`);

// What each stat measures (fixed wording, no device names).
const STAT_WHAT = {
  strength: 'How strong you are compared with people of your age and sex.',
  symmetry: 'How evenly your left and right legs produce force at the hips and knees.',
  balance: 'How steady you are standing on one leg with your eyes closed.',
  movement: 'How well you move through a deep overhead squat.',
  mobility: 'How far you rotate through your trunk and shoulders.',
  speed: 'Sprint and change-of-direction speed.'
};
// What to work on for each stat (no exercises: those come from a coach or library).
const STAT_FOCUS = {
  strength: 'building strength in the muscle groups tested',
  symmetry: 'evening out force between your left and right legs',
  balance: 'single-leg control',
  movement: 'squat depth and control',
  mobility: 'rotation range through your trunk and shoulders'
};
// Tests that complete a stat that wasn't tested.
const STAT_TESTS = { balance: 'Single Leg Stand', movement: 'Overhead Squat', mobility: 'Trunk Rotation or Shoulder Arc of Motion' };

const tierName = (ovr) => (ovr >= 75 ? 'Gold' : ovr >= 65 ? 'Silver' : 'Bronze');
const level = (v) => (v >= 75 ? 'a strength' : v >= 65 ? 'solid' : 'an area to build');
const bandWords = (from) => {
  const byTest = new Map();
  for (const f of from) {
    if (!byTest.has(f.test)) byTest.set(f.test, []);
    byTest.get(f.test).push(`${f.side === 'value' ? '' : `${f.side} `}${VALD_BAND_WORDS[f.band].toLowerCase()}`);
  }
  return [...byTest.entries()].map(([t, xs]) => `${t}: ${xs.join(', ')}`).join('; ');
};

/**
 * Card content for one session.
 *   tests:   machine input tests;  sport: football | padel | cricket | general
 *   profile: { name, age, position, dominantHand, testDate }
 *   options: { useProposed (default: config), prose (polished text), footNote }
 * Returns { card, reportContent, coachText }. coachText is every sentence the
 * report says, chosen in code; prose (Gemini's polish of it) replaces it
 * only after its checks pass.
 */
const buildMachineReport = ({ tests, sport, profile, useProposed, prose = null, footNote = null }) => {
  if (!SPORTS.includes(sport)) throw new Error(`no client card for sport "${sport}"`);
  const mcfg = loadMachineConfig();
  const general = sport === 'general';
  if (useProposed === undefined) useProposed = !!mcfg.symmetry.count_in_ovr;
  // General / Gym: its own Dynamo tests and LSI flag lines; no dominant-arm tests.
  const cfg = general ? { tests: generalBattery(mcfg), lsi: mcfg.general_lsi } : loadConfig(sport);
  const sp = general ? GENERAL : SPORT_PROFILES[sport];
  const card = scoreMachineCard(tests, cfg.tests, { useProposed, mcfg });
  const dyn = Object.keys(cfg.tests).filter(k => cfg.tests[k].source === 'vald' && cfg.tests[k].dynamo);
  const statOf = (t) => (dyn.includes(t.key) ? 'Strength'
    : mcfg.balance_tests.includes(t.key) ? 'Balance'
      : mcfg.movement_tests.includes(t.key) ? 'Movement'
        : mcfg.mobility_tests.includes(t.key) ? 'Mobility' : null);

  // Each test's own score on the card scale (what it puts into its stat).
  const testScore = (t) => {
    const s = Object.values(t.sides);
    if (dyn.includes(t.key)) {
      const p = s.map(x => x.percentile).filter(isSet);
      return p.length ? pyRound(throughAnchors(mean(p), mcfg.vald_percentile_anchors, mcfg.score_floor, mcfg.score_cap), 1) : null;
    }
    const b = s.map(x => mcfg.vald_band_labels.indexOf(x.band)).filter(i => i !== -1).map(i => mcfg.vald_band_midpoints[i]);
    return b.length ? pyRound(mean(b), 1) : null;
  };

  const used = tests.filter(statOf);
  const testTable = used.map(t => {
    const score = testScore(t);
    return {
      test: t.label, result: sideText(t), unit: t.unit, timing: null, score, status: 'completed',
      partial: false, oneSideOnly: !t.sides.value && (!isSet(t.sides.left?.value) || !isSet(t.sides.right?.value)),
      feedsOvr: true, ...(score === null ? { notRated: true } : {})
    };
  });

  const lsiOf = (t) => {
    const l = t.sides.left?.value;
    const r = t.sides.right?.value;
    return isSet(l) && isSet(r) && Math.max(l, r) > 0 ? pyRound(Math.min(l, r) / Math.max(l, r) * 100, 1) : null;
  };

  // Flags: left/right gaps on the lower-body tests Symmetry is scored from.
  // Arm tests are never flagged: they're shown as playing arm vs other arm.
  const flags = [];
  for (const t of tests.filter(x => dyn.includes(x.key) && mcfg.symmetry_tests.includes(x.key))) {
    const lsi = lsiOf(t);
    if (lsi === null || lsi >= cfg.lsi.amber_below) continue;
    flags.push({ level: lsi < cfg.lsi.red_below ? 'red' : 'amber', test: t.label, type: 'LSI', value: lsi });
  }

  // Playing arm vs other arm (General / Gym: dominant arm): shown, not scored.
  const hand = profile.dominantHand === 'L' ? 'left' : profile.dominantHand === 'R' ? 'right' : null;
  const armWord = general ? 'Dominant arm' : 'Playing arm';
  const armComparison = tests.filter(t => mcfg.arm_tests.includes(t.key) && lsiOf(t) !== null).map(t => {
    if (!hand) return { test: t.label, unit: t.unit, labels: ['Left', 'Right'], values: [t.sides.left.value, t.sides.right.value], otherPct: null };
    const other = hand === 'left' ? 'right' : 'left';
    const pv = t.sides[hand].value;
    const ov = t.sides[other].value;
    return { test: t.label, unit: t.unit, labels: [armWord, 'Other arm'], values: [pv, ov], otherPct: pv > 0 ? pyRound(ov / pv * 100, 1) : null };
  });

  // ---------- every sentence, chosen in code ----------
  const st = card.stats;
  // The battery's tests that would score a stat that wasn't tested.
  const labelOf = (k) => ALL_TEST_INFO[k]?.label || k;
  const joinAnd = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
  const testsFor = {
    ...STAT_TESTS,
    strength: joinAnd(dyn.map(labelOf)),
    symmetry: joinAnd(dyn.filter(k => mcfg.symmetry_tests.includes(k)).map(labelOf))
  };
  const proposedLine = 'This score is proposed and pending clinical review, so it doesn\'t count towards your rating yet.';
  const statLine = (k) => {
    const s = st[k];
    if (!isSet(s.value)) {
      if (k === 'mobility' && s.measuredNotRated?.length) return `Not tested: ${s.measuredNotRated.join(' and ')} was measured, but VALD gave no band for it, so it isn't rated.`;
      if (k === 'symmetry' && testsFor.symmetry) return `Not tested: add ${testsFor.symmetry} (left and right) to your next session to score it.`;
      return `Not tested: add ${testsFor[k]} to your next session to score it.`;
    }
    const head = `${STAT_NAMES[k]} is ${s.value}, ${level(s.value)}.`;
    let body = '';
    if (k === 'strength') body = ` On average you are stronger than ${s.averagePercentile}% of people your age and sex.`;
    if (k === 'symmetry') {
      const low = [...s.from].sort((a, b) => a.lsi - b.lsi)[0];
      body = ` Your weaker side produces ${low.lsi}% of your stronger side's force on ${low.test}.`;
      if (s.proposed && !card.ovr.counted.includes('symmetry')) body += ` ${proposedLine}`;
    }
    if (['balance', 'movement', 'mobility'].includes(k)) body = ` Rated against people your age and sex. ${bandWords(s.from)}.`;
    return head + body;
  };
  const scoredKeys = mcfg.stats.filter(k => card.ovr.counted.includes(k));
  const sorted = scoredKeys.map(k => [k, st[k].value]).sort((a, b) => a[1] - b[1]);
  const priority = sorted.length ? sorted[0][0] : null;
  const best = sorted.length ? sorted[sorted.length - 1][0] : null;
  const missing = mcfg.stats.filter(k => !isSet(st[k].value) && testsFor[k]);
  const ovr = card.ovr.value;
  const coachText = {
    summary: [
      ovr !== null
        ? `Your overall rating is ${ovr} (${tierName(ovr)}), the average of ${scoredKeys.length} scored stats.`
        : `Your rating is pending: ${card.ovr.counted.length} of ${mcfg.stats.length} stats are scored, and a rating needs ${mcfg.ovr_min_stats}.`,
      best && best !== priority && st[best].value >= 65 ? `Your strongest stat is ${STAT_NAMES[best]}.` : '',
      priority ? `Your development priority is ${STAT_NAMES[priority]}.` : ''
    ].filter(Boolean).join(' '),
    stats: Object.fromEntries(mcfg.stats.map(k => [k, statLine(k)])),
    focus: [
      priority ? `Focus next on ${STAT_FOCUS[priority]}, then retest to see your progress.` : '',
      missing.length ? `Add ${joinAnd([...new Set(missing.flatMap(k => testsFor[k].split(/, | and /)))])} to your next session to complete your card.` : ''
    ].filter(Boolean).join(' '),
    flags: flags.map(f => `Your weaker side produces ${f.value}% of your stronger side's force here. Evening this out is an area to build.`)
  };
  const text = prose || coachText;

  const ovrScores = CARD_ORDER.map(k => {
    if (card.locked[k]) return { name: STAT_NAMES[k], score: null, status: 'locked', lockedText: card.locked[k].text };
    const s = st[k];
    return {
      name: STAT_NAMES[k], score: s.value,
      ...(s.value === null ? { status: 'not_in_report' } : {}),
      ...(s.proposed ? { proposed: true, counted: card.ovr.counted.includes(k) } : {})
    };
  });

  // How you compare (VALD's own terms), and everything else as extras.
  const valdNorms = used.map(t => ({
    test: t.label, device: t.device, cardScore: testScore(t), notRated: testScore(t) === null,
    sides: Object.entries(t.sides).map(([side, s]) => ({
      side: side === 'value' ? 'Result' : side[0].toUpperCase() + side.slice(1),
      result: fmt(s.value, t.unit),
      ...(isSet(s.percentile) ? { percentile: s.percentile, percentileLabel: `${ordinal(s.percentile)} percentile`, percentileText: percentileWords(s.percentile, t.device).replace(/^./, c => c.toUpperCase()) } : {}),
      ...(s.band ? { band: VALD_BAND_WORDS[s.band] } : {})
    }))
  }));
  const additionalVald = tests.filter(t => !statOf(t)).map(t => {
    const row = { test: t.label, device: t.device, unit: t.unit, date: profile.testDate, stat: null, source: 'vald_pdf' };
    for (const [side, s] of Object.entries(t.sides)) {
      if (!isSet(s.value)) continue;
      const sfx = side === 'value' ? '' : `_${side}`;
      row[side] = s.value;
      if (isSet(s.percentile)) row[`percentile${sfx}`] = s.percentile;
      if (s.band) row[`band${sfx}`] = s.band;
    }
    if (isSet(row.left) && isSet(row.right) && Math.max(row.left, row.right) > 0) row.symmetry = pyRound(Math.min(row.left, row.right) / Math.max(row.left, row.right) * 100, 1);
    return row;
  });

  const proposedNote = st.symmetry.proposed && st.symmetry.value !== null
    ? ` *Symmetry: ${mcfg.symmetry.label}${card.ovr.counted.includes('symmetry') ? '' : '; not counted in the OVR yet'}.` : '';
  const reportContent = {
    statSet: 'machine_v1',
    sportKey: sp.key,
    athleteName: profile.name, age: profile.age, sport: sp.displayName, position: profile.position,
    ...(profile.dominantHand ? { dominantHand: profile.dominantHand } : {}),
    testDate: profile.testDate,
    batteryLabel: `${sp.displayName} Client Card`,
    overallOVR: ovr,
    ovrProvisional: false,
    ovrStatus: ovr === null ? 'unrated' : 'final',
    ovrMessage: card.ovr.message || '',
    ovrReasons: [],
    ovrScores,
    testTable,
    flags: flags.map((f, i) => ({ ...f, note: text.flags[i] || '' })),
    summary: text.summary,
    fieldMeaning: {
      playerProfile: 'Machine-tested profile, compared with people of the same age and sex.',
      developmentPriority: priority ? STAT_NAMES[priority] : '',
      // "What your stats mean": one entry per card slot, in card order.
      stats: CARD_ORDER.map(k => ({
        key: k, name: STAT_NAMES[k], score: card.locked[k] ? null : st[k].value,
        status: card.locked[k] ? 'locked' : isSet(st[k].value) ? (st[k].proposed && !card.ovr.counted.includes(k) ? 'proposed' : 'scored') : 'not_tested',
        what: STAT_WHAT[k],
        body: card.locked[k] ? `Locked: ${card.locked[k].text.replace(/^./, c => c.toLowerCase())}.` : text.stats[k]
      })),
      focus: text.focus
    },
    armComparison,
    armLabel: general ? 'Dominant arm vs other arm' : 'Playing arm vs other arm',
    valdNorms,
    additionalVald,
    valdFromPdf: true,
    draftNotice: mcfg.draft_notice || null,
    proseSource: prose ? 'gemini' : 'coach',
    benchmarkNote: footNote || `Scores come from VALD's age- and sex-matched data. OVR = average of the scored stats (3 of 5 needed).${proposedNote}`,
    configVersion: card.config_version
  };
  return { card, reportContent, coachText };
};

module.exports = { buildMachineReport, machineTestsFromPdf, STAT_NAMES, CARD_ORDER, SPORTS, GENERAL };

// services/machineCard.service.js
// Client cards from VALD machine tests (scoring/machineCard.js): VALD Hub PDF
// tests in, the report content the card renders out. Saved reports without
// statSet "machine_v1" keep their old cards.

const { matchName, VALD_BAND_LABEL, VALD_BAND_WORDS, ordinal, percentileWords } = require('./vald/valdHubPdf');
const { scoreMachineCard, loadMachineConfig, generalBattery, mobilityTestsFor, throughAnchors, ratedScore } = require('../scoring/machineCard');
const { loadConfig, pyRound } = require('../scoring/scoring');
const { ALL_TEST_INFO, SPORT_PROFILES } = require('./scoredReport.service');

const SPORT_LIBRARY = require('../library/client_card_sport_lines.json');
const SPORT_LINES = SPORT_LIBRARY.sports;
// Cricket: the role's own lines ("a pace bowler"), else general cricket lines.
const sportLinesFor = (sportKey, position) =>
  (sportKey === 'cricket' && SPORT_LIBRARY.cricket_roles?.[String(position || '').toUpperCase()]) || SPORT_LINES[sportKey];

const isSet = (v) => v !== undefined && v !== null;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

// Clients with no sport: General / Gym (its Dynamo tests are in machine_card_v1.json).
const GENERAL = { key: 'general', displayName: 'General / Gym' };
const SPORTS = ['football', 'padel', 'cricket', 'general'];

// Card stat names, in card order. Speed is the locked slot.
const STAT_NAMES = { strength: 'Strength', symmetry: 'Symmetry', balance: 'Balance', movement: 'Movement', mobility: 'Mobility', speed: 'Speed' };
const CARD_ORDER = ['strength', 'symmetry', 'balance', 'movement', 'mobility', 'speed'];

// Which card test a VALD test is, from its name, device and unit (stored
// cards are re-classified this way, so regenerating applies current rules).
// Mobility tests are HumanTrak range tests, never Dynamo strength (N).
const MOBILITY_NAMES = [
  ['trunk_lateral_flexion', /\btrunk\b.*\blateral\b|\blateral flexion\b/],
  ['trunk_flexion', /\btrunk flexion\b/],
  ['trunk_extension', /\btrunk extension\b/],
  ['arc_of_motion', /\barc of motion\b/],
  ['dorsiflexion', /\bdorsiflexion\b|\bknee to wall\b/],
  ['hip_rotation', /\bhip\b.*\b(internal|external|ir|er)\b|\b(internal|external) rotation\b.*\bhip\b/]
];
const CARD_LABELS = {
  trunk_flexion: 'Trunk Flexion', trunk_extension: 'Trunk Extension', trunk_lateral_flexion: 'Trunk Lateral Flexion',
  arc_of_motion: 'Shoulder Arc of Motion', dorsiflexion: 'Weight Bearing Dorsiflexion', hip_rotation: 'Seated Hip IR/ER',
  single_leg_squat: 'Single Leg Squat'
};
const classifyTest = ({ name, device, unit }) => {
  const n = String(name || '').toLowerCase().replace(/(\.\.\.|…)$/, '').replace(/[^a-z0-9/ ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (device !== 'Dynamo' && unit !== 'N') {
    for (const [key, re] of MOBILITY_NAMES) if (re.test(n)) return key;
    if (/\bsingle leg squat\b/.test(n)) return 'single_leg_squat';
  }
  const keys = matchName(name);
  return keys.length === 1 ? keys[0] : null;
};
// A stored test's display name back to its PDF-ish name for classifying.
const keyOf = (t) => classifyTest({ name: t.pdfName || t.label, device: t.device, unit: t.unit });

/** Parsed VALD Hub PDF (valdHubPdf.parsePages) -> machine card input tests. */
const machineTestsFromPdf = (parsed) => parsed.tests.map(t => {
  const unit = t.results.find(r => r.unit)?.unit || '';
  const key = classifyTest({ name: t.test, device: t.device, unit });
  const label = CARD_LABELS[key] || (key && ALL_TEST_INFO[key] ? ALL_TEST_INFO[key].label : t.test);
  return {
    key, label, pdfName: t.test, metric: t.metric || '', device: t.device, unit,
    sides: Object.fromEntries(t.results.map(r => [r.side, { value: r.value, percentile: r.percentile, band: r.band ? VALD_BAND_LABEL[r.band] : null }]))
  };
});

const fmt = (v, unit) => (isSet(v) ? `${v}${unit === '°' ? '°' : ` ${unit}`}` : '—');
const sideText = (t) => (t.sides.value ? String(t.sides.value.value ?? '—') : `L ${t.sides.left?.value ?? '—'} · R ${t.sides.right?.value ?? '—'}`);
const titleCase = (s) => String(s || '').toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());

// What each stat measures (fixed wording, no device names).
const STAT_WHAT = {
  strength: 'How strong you are compared with people of your age and sex.',
  symmetry: 'How evenly your left and right legs produce force at the hips and knees.',
  balance: 'How well you control your body over one leg in a single-leg squat.',
  movement: 'How well you move through a deep overhead squat.',
  mobility: 'How far you move through your trunk, shoulders, hips and ankles.',
  speed: 'Sprint and change-of-direction speed.'
};
// What to work on for each stat (no exercises: those come from a coach or library).
const STAT_FOCUS = {
  strength: 'building strength in the muscle groups tested',
  symmetry: 'evening out force between your left and right legs',
  balance: 'single-leg control',
  movement: 'squat depth and control',
  mobility: 'range of motion in the areas tested'
};
// Tests that complete a stat that wasn't tested.
const STAT_TESTS = { balance: 'Single Leg Squat', movement: 'Overhead Squat', mobility: 'a trunk, shoulder, hip or ankle mobility test' };
// The chip for a position (never shown in the OVERALL area of a client card).
const POSITION_CHIP = { football: 'POSITION', padel: 'SIDE', cricket: 'ROLE', general: 'ROLE' };
// Role and position codes as they read on the card.
const POSITION_WORDS = {
  cricket: { BAT: 'Batter', PACE: 'Pace bowler', SPIN: 'Spin bowler', ALL: 'All-rounder', WK: 'Wicketkeeper' },
  football: { GK: 'Goalkeeper', DEF: 'Defender', MID: 'Midfielder', FWD: 'Forward' }
};
// What Mobility measures, from the sport's mobility battery.
const MOBILITY_WHAT = {
  football: 'How far your ankle bends forward with your weight on it.',
  cricket: 'How far you move through your shoulders and bend sideways through your trunk.'
};

const tierName = (ovr) => (ovr >= 75 ? 'Gold' : ovr >= 65 ? 'Silver' : 'Bronze');
const level = (v) => (v >= 75 ? 'a strength' : v >= 65 ? 'solid' : 'an area to build');
const ratingWords = (sides) => sides.map(x => `${x.side === 'value' ? '' : `${x.side} `}${isSet(x.percentile) ? `${ordinal(x.percentile)} percentile` : VALD_BAND_WORDS[x.band].toLowerCase()}`).join(', ');

// Single Leg Stand: which leg was steadier, only when the metric says which
// way is better (sway / ellipse area / path: lower; time held: higher).
const steadierLeg = (t) => {
  const l = t.sides.left?.value;
  const r = t.sides.right?.value;
  if (!isSet(l) || !isSet(r) || l === r) return null;
  const m = `${t.metric || ''} ${t.unit || ''}`.toLowerCase();
  const lowerBetter = /sway|ellipse|area|path|velocity|displacement|mm²|cm²/.test(m);
  const higherBetter = !lowerBetter && /\btime\b|duration|held|\bs$/.test(m);
  if (!lowerBetter && !higherBetter) return null;
  const left = lowerBetter ? l < r : l > r;
  return { leg: left ? 'left' : 'right', basis: lowerBetter ? 'lower sway' : 'held longer' };
};

/** What a VALD test does on a sport's client card, for the tester's check list. */
const clientRoleOf = (sport) => {
  const mcfg = loadMachineConfig();
  const battery = sport === 'general' ? generalBattery(mcfg) : loadConfig(sport).tests;
  const dyn = Object.keys(battery).filter(k => battery[k].source === 'vald' && battery[k].dynamo);
  const arm = sport === 'general' ? 'dominant arm vs other arm' : 'playing arm vs other arm';
  return (t) => {
    const key = keyOf(t);
    if (mcfg.never_scored[key]) return `Shown, measured · not rated (${mcfg.never_scored[key]})`;
    if (dyn.includes(key)) {
      if (mcfg.arm_tests.includes(key)) return `Strength (and ${arm}, not scored)`;
      if (mcfg.symmetry.show_on_card !== false && mcfg.symmetry_tests.includes(key)) return 'Strength and Symmetry';
      return 'Strength';
    }
    if (mcfg.balance_tests.includes(key)) return 'Balance';
    if (mcfg.movement_tests.includes(key)) return 'Movement';
    if (mobilityTestsFor(sport, mcfg).includes(key)) return 'Mobility';
    if (mcfg.arm_tests.includes(key)) return `Shown as ${arm}, not scored`;
    return null;
  };
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
const buildMachineReport = ({ tests: testsIn, sport, profile, useProposed, prose = null, footNote = null }) => {
  if (!SPORTS.includes(sport)) throw new Error(`no client card for sport "${sport}"`);
  const mcfg = loadMachineConfig();
  const general = sport === 'general';
  if (useProposed === undefined) useProposed = !!mcfg.symmetry.count_in_ovr;
  const tests = testsIn.map(t => {
    const key = keyOf(t);
    return { ...t, key, label: CARD_LABELS[key] || (key && ALL_TEST_INFO[key] && !t.pdfName ? ALL_TEST_INFO[key].label : t.label) };
  });
  // General / Gym: its own Dynamo tests and LSI flag lines; no dominant-arm tests.
  const cfg = general ? { tests: generalBattery(mcfg), lsi: mcfg.general_lsi } : loadConfig(sport);
  const sp = general ? GENERAL : SPORT_PROFILES[sport];
  const card = scoreMachineCard(tests, cfg.tests, { useProposed, mcfg, sport });
  const st = card.stats;
  const dyn = Object.keys(cfg.tests).filter(k => cfg.tests[k].source === 'vald' && cfg.tests[k].dynamo);
  const statOf = (t) => (mcfg.never_scored[t.key] ? null
    : dyn.includes(t.key) ? 'Strength'
      : mcfg.balance_tests.includes(t.key) ? 'Balance'
        : mcfg.movement_tests.includes(t.key) ? 'Movement'
          : mobilityTestsFor(sport, mcfg).includes(t.key) ? 'Mobility' : null);

  // Each test's own score on the card scale (what it puts into its stat):
  // Dynamo battery tests from their percentiles, other tests from VALD's
  // band or percentile. Whole numbers.
  const testScore = (t) => {
    if (dyn.includes(t.key)) {
      const p = Object.values(t.sides).map(x => x.percentile).filter(isSet);
      return p.length ? pyRound(throughAnchors(mean(p), mcfg.vald_percentile_anchors, mcfg.score_floor, mcfg.score_cap)) : null;
    }
    const r = ratedScore(t, mcfg);
    return r === null ? null : pyRound(r);
  };
  const ratedSides = (t) => Object.entries(t.sides).filter(([, x]) => isSet(x.value) && (isSet(x.percentile) || x.band)).map(([side, x]) => ({ side, ...x }));

  const lsiOf = (t) => {
    const l = t.sides.left?.value;
    const r = t.sides.right?.value;
    return isSet(l) && isSet(r) && Math.max(l, r) > 0 ? pyRound(Math.min(l, r) / Math.max(l, r) * 100, 1) : null;
  };

  // All tests: every test read from the PDF, in the PDF's order.
  const testTable = tests.map(t => {
    const stat = statOf(t);
    const score = stat ? testScore(t) : null;
    const rated = ratedSides(t);
    const row = {
      test: t.label, result: sideText(t), unit: t.unit, timing: null, score, status: 'completed',
      partial: false, oneSideOnly: !t.sides.value && (!isSet(t.sides.left?.value) || !isSet(t.sides.right?.value)),
      feedsOvr: true
    };
    // Lower-body Dynamo tests also feed Symmetry when it's shown.
    const feeds = stat === 'Strength' && !st.symmetry.hidden && mcfg.symmetry_tests.includes(t.key) && lsiOf(t) !== null ? 'Strength · Symmetry' : stat;
    if (stat && score !== null) return { ...row, stat: feeds };
    if (!rated.length) return { ...row, notRated: true };
    // Rated by VALD, but not part of a card stat: VALD's own words, no score.
    return { ...row, chip: `VALD ${ratingWords(rated.map(x => ({ ...x, side: x.side === 'value' ? 'value' : x.side[0].toUpperCase() })))}`.toUpperCase() };
  });

  // Flags: left/right gaps on the lower-body tests Symmetry is scored from,
  // only while Symmetry is shown. Arm tests are never flagged.
  const flags = [];
  for (const t of st.symmetry.hidden ? [] : tests.filter(x => dyn.includes(x.key) && mcfg.symmetry_tests.includes(x.key))) {
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
  // The battery's tests that would score a stat that wasn't tested.
  const labelOf = (k) => ALL_TEST_INFO[k]?.label || k;
  const joinAnd = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
  const testsFor = { ...STAT_TESTS, strength: joinAnd(dyn.map(labelOf)) };
  const notRatedNote = (names) => (names.length ? ` ${joinAnd(names)} ${names.length > 1 ? 'were' : 'was'} measured, but VALD gave no band, so ${names.length > 1 ? 'they aren\'t' : 'it isn\'t'} counted.` : '');
  const stand = tests.find(t => t.key === 'single_leg_stand');
  const standNote = (() => {
    if (!stand) return '';
    const sl = steadierLeg(stand);
    const vals = stand.sides.value ? fmt(stand.sides.value.value, stand.unit) : `left ${fmt(stand.sides.left?.value, stand.unit)}, right ${fmt(stand.sides.right?.value, stand.unit)}`;
    return ` Single Leg Stand (eyes closed) was measured: ${vals}${sl ? `. Your ${sl.leg} leg was steadier (${sl.basis})` : ''}. VALD has no age- and sex-matched norms for it, so it isn't scored.`;
  })();
  const statLine = (k) => {
    const s = st[k];
    if (s.hidden) return 'Not shown yet: the Symmetry scale is pending clinical review.';
    const extra = k === 'balance' ? standNote : '';
    if (!isSet(s.value)) {
      if (s.measuredNotRated?.length) return `Not tested:${notRatedNote(s.measuredNotRated)}${extra}`;
      return `Not tested: add ${testsFor[k]} to your next session to score it.${extra}`;
    }
    const head = `${STAT_NAMES[k]} is ${s.value}, ${level(s.value)}.`;
    let body = '';
    if (k === 'strength') body = ` On average you are stronger than ${s.averagePercentile}% of people your age and sex.`;
    if (k === 'symmetry') {
      const low = [...s.from].sort((a, b) => a.lsi - b.lsi)[0];
      body = ` Your weaker side produces ${low.lsi}% of your stronger side's force on ${low.test}.`;
    }
    if (['balance', 'movement', 'mobility'].includes(k)) {
      body = ` Rated against people your age and sex. ${s.from.map(f => `${f.test}: ${ratingWords(f.sides)}`).join('; ')}.${notRatedNote(s.measuredNotRated || [])}`;
    }
    return head + body + extra;
  };
  const scoredKeys = mcfg.stats.filter(k => card.ovr.counted.includes(k));
  const sorted = scoredKeys.map(k => [k, st[k].value]).sort((a, b) => a[1] - b[1]);
  const priority = sorted.length ? sorted[0][0] : null;
  const best = sorted.length ? sorted[sorted.length - 1][0] : null;
  const missing = mcfg.stats.filter(k => !isSet(st[k].value) && !st[k].hidden && testsFor[k]);
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
      missing.length ? `Add ${joinAnd([...new Set(missing.map(k => testsFor[k]))])} to your next session to complete your card.` : ''
    ].filter(Boolean).join(' '),
    flags: flags.map(f => `Your weaker side produces ${f.value}% of your stronger side's force here. Evening this out is an area to build.`)
  };
  const text = prose || coachText;

  const ovrScores = CARD_ORDER.map(k => {
    if (card.locked[k]) return { name: STAT_NAMES[k], score: null, status: 'locked', lockedText: card.locked[k].text };
    const s = st[k];
    if (s.hidden) return { name: STAT_NAMES[k], score: null, status: 'hidden' };
    return {
      name: STAT_NAMES[k], score: s.value,
      ...(s.value === null ? { status: 'not_in_report' } : {}),
      ...(s.proposed ? { proposed: true, counted: card.ovr.counted.includes(k) } : {})
    };
  });

  // How you compare (VALD's own terms): every test, rated or not.
  const valdNorms = tests.map(t => ({
    test: t.label, device: t.device, cardScore: statOf(t) ? testScore(t) : null, notRated: !ratedSides(t).length,
    sides: Object.entries(t.sides).map(([side, s]) => ({
      side: side === 'value' ? 'Result' : side[0].toUpperCase() + side.slice(1),
      result: fmt(s.value, t.unit),
      ...(isSet(s.percentile) ? { percentile: s.percentile, percentileLabel: `${ordinal(s.percentile)} percentile`, percentileText: percentileWords(s.percentile, t.device).replace(/^./, c => c.toUpperCase()) } : {}),
      ...(s.band ? { band: VALD_BAND_WORDS[s.band] } : {})
    }))
  }));

  const position = String(profile.position || '').trim();
  const lines = sportLinesFor(sp.key, position);
  const reportContent = {
    statSet: 'machine_v1',
    sportKey: sp.key,
    athleteName: profile.name, age: profile.age, sport: sp.displayName,
    // Never in the OVERALL area: a chip (e.g. "SIDE Left") in the chips row.
    position: '',
    ...(position ? { positionChip: { label: POSITION_CHIP[sp.key], value: POSITION_WORDS[sp.key]?.[position.toUpperCase()] || titleCase(position) } } : {}),
    ...(profile.dominantHand ? { dominantHand: profile.dominantHand } : {}),
    testDate: profile.testDate || null,
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
        key: k, name: STAT_NAMES[k], score: card.locked[k] || st[k].hidden ? null : st[k].value,
        status: card.locked[k] ? 'locked' : st[k].hidden ? 'hidden' : isSet(st[k].value) ? (st[k].proposed && !card.ovr.counted.includes(k) ? 'proposed' : 'scored') : 'not_tested',
        what: (k === 'mobility' && MOBILITY_WHAT[sp.key]) || STAT_WHAT[k],
        // "What it means for <sport>": fixed text from the library (not sent to the AI).
        ...(lines?.[k] && !st[k]?.hidden ? { sportLine: { sport: lines.label, text: lines[k] } } : {}),
        body: card.locked[k] ? `Locked: ${card.locked[k].text.replace(/^./, c => c.toLowerCase())}.` : text.stats[k]
      })),
      focus: text.focus
    },
    armComparison,
    armLabel: general ? 'Dominant arm vs other arm' : 'Playing arm vs other arm',
    valdNorms,
    // Every test is in All Tests, so there are no separate extra results.
    additionalVald: [],
    valdFromPdf: true,
    draftNotice: mcfg.draft_notice || null,
    proseSource: prose ? 'gemini' : 'coach',
    benchmarkNote: footNote || `Scores come from VALD's age- and sex-matched data. OVR = average of the scored stats (3 of 5 needed).${st.symmetry.hidden ? ' Symmetry is not shown until its scale is approved.' : ''}`,
    configVersion: card.config_version
  };
  return { card, reportContent, coachText };
};

module.exports = { buildMachineReport, machineTestsFromPdf, classifyTest, clientRoleOf, steadierLeg, STAT_NAMES, CARD_ORDER, SPORTS, GENERAL };

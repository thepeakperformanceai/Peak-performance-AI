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

/**
 * Card content for one session.
 *   tests:   machine input tests;  sport: football | padel | cricket
 *   profile: { name, age, position, dominantHand, testDate }
 *   options: { useProposed, narrative: { summary, playerProfile }, footNote }
 * Returns { card, reportContent }.
 */
const buildMachineReport = ({ tests, sport, profile, useProposed = false, narrative = {}, footNote = null }) => {
  if (!SPORTS.includes(sport)) throw new Error(`no client card for sport "${sport}"`);
  const mcfg = loadMachineConfig();
  const general = sport === 'general';
  // General / Gym: its own Dynamo tests and LSI flag lines; no dominant-arm tests.
  const cfg = general ? { tests: generalBattery(mcfg), lsi: mcfg.general_lsi, dominant_arm_tests: [] } : loadConfig(sport);
  const sp = general ? GENERAL : SPORT_PROFILES[sport];
  const card = scoreMachineCard(tests, cfg.tests, { useProposed, mcfg });
  const dyn = Object.keys(cfg.tests).filter(k => cfg.tests[k].source === 'vald' && cfg.tests[k].dynamo);
  const statOf = (t) => (dyn.includes(t.key) ? 'Strength · Symmetry'
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

  // Flags: left/right strength gaps (sport's LSI thresholds; dominant-arm
  // gaps in racket and bowling sports are "monitor").
  const flags = [];
  for (const t of tests.filter(x => dyn.includes(x.key))) {
    const l = t.sides.left?.value;
    const r = t.sides.right?.value;
    if (!isSet(l) || !isSet(r) || Math.max(l, r) <= 0) continue;
    const lsi = pyRound(Math.min(l, r) / Math.max(l, r) * 100, 1);
    const weaker = l < r ? 'L' : r < l ? 'R' : null;
    const domWeaker = (cfg.dominant_arm_tests || []).includes(t.key) && weaker && weaker === profile.dominantHand;
    if (lsi >= cfg.lsi.amber_below) continue;
    flags.push({ level: domWeaker ? 'monitor' : lsi < cfg.lsi.red_below ? 'red' : 'amber', test: t.label, type: 'LSI', value: lsi, ...(domWeaker ? { dominantSideWeaker: true } : {}), note: '' });
  }

  const ovrScores = CARD_ORDER.map(k => {
    if (card.locked[k]) return { name: STAT_NAMES[k], score: null, status: 'locked', lockedText: card.locked[k].text };
    const s = card.stats[k];
    return {
      name: STAT_NAMES[k], score: s.value,
      ...(s.value === null ? { status: 'not_in_report' } : {}),
      ...(s.proposed ? { proposed: true, counted: card.ovr.counted.includes(k) } : {})
    };
  });
  const scored = ovrScores.filter(s => s.score !== null).sort((a, b) => a.score - b.score);

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

  const proposedNote = card.stats.symmetry.proposed && card.stats.symmetry.value !== null
    ? ` *Symmetry: ${mcfg.symmetry.label}${useProposed ? '' : '; not counted in the OVR yet'}.` : '';
  const reportContent = {
    statSet: 'machine_v1',
    athleteName: profile.name, age: profile.age, sport: sp.displayName, position: profile.position,
    ...(profile.dominantHand ? { dominantHand: profile.dominantHand } : {}),
    testDate: profile.testDate,
    batteryLabel: `${sp.displayName} Client Card`,
    sportKey: sp.key,
    overallOVR: card.ovr.value,
    ovrProvisional: false,
    ovrStatus: card.ovr.value === null ? 'unrated' : 'final',
    ovrMessage: card.ovr.message || '',
    ovrReasons: [],
    ovrScores,
    testTable,
    flags,
    summary: narrative.summary || '',
    fieldMeaning: { playerProfile: narrative.playerProfile || '', developmentPriority: scored.length ? scored[0].name : '', stats: [] },
    valdNorms,
    additionalVald,
    valdFromPdf: true,
    benchmarkNote: footNote || `VALD machine tests compared with people of the same age and sex. OVR = average of the scored stats (3 of 5 needed).${proposedNote}`,
    configVersion: card.config_version
  };
  return { card, reportContent };
};

module.exports = { buildMachineReport, machineTestsFromPdf, STAT_NAMES, CARD_ORDER, SPORTS };

// scoring/machineCard.js
// Client card stats from VALD machine tests only (machine_card_v1.json):
//
//   Strength  average of every VALD percentile on the battery's Dynamo tests,
//             onto the card scale (vald_percentile_anchors)
//   Symmetry  per battery Dynamo test with both sides: LSI (weaker / stronger
//             x 100) onto the card scale (symmetry.lsi_anchors), averaged.
//             VALD's PDF prints no asymmetry band, so these anchors are
//             PROPOSED – pending clinical review (symmetry.status)
//   Balance   VALD band on Single Leg Stand (band midpoint)
//   Movement  VALD band on Overhead Squat
//   Mobility  VALD band on Trunk Rotation and/or Shoulder Arc of Motion
//   Speed     locked slot ("Unlocks with Performance add-on"): never scored,
//             not in the OVR, not counted for Unrated
//
// OVR = plain average of the scored stats; no rating ("Rating pending" on
// the card, the Unrated tier) with fewer than ovr_min_stats of the five. Nothing missing is estimated. A stat on
// proposed numbers is counted only when `useProposed` is true.
//
// Input tests (one per VALD test read):
//   { key, label, device, unit, sides: { left|right|value: { value, percentile, band } } }
// key is the master test key ("shoulder_er", "trunk_rotation", ...) or
// "arc_of_motion", or null for anything else; band is the engine label.

const { pyRound } = require('./scoring');

const loadMachineConfig = () => require('./machine_card_v1.json');

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
// Straight lines through the anchors; flat outside them, then clamped.
const throughAnchors = (x, anchors, floor, cap) => {
  const pts = [...anchors].sort((a, b) => a[0] - b[0]);
  if (x <= pts[0][0]) return clamp(pts[0][1], floor, cap);
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    if (x <= x1) return clamp(y0 + (y1 - y0) * (x - x0) / (x1 - x0), floor, cap);
  }
  return clamp(pts[pts.length - 1][1], floor, cap);
};

const isSet = (v) => v !== undefined && v !== null;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sidesOf = (t) => Object.entries(t.sides || {}).filter(([, s]) => isSet(s.value));

/** The battery's Dynamo tests (from a sport config's tests). */
const dynamoKeys = (battery) => Object.keys(battery).filter(k => battery[k].source === 'vald' && battery[k].dynamo);

const bandStat = (tests, keys, mcfg) => {
  const used = tests.filter(t => keys.includes(t.key));
  const scores = [];
  const from = [];
  for (const t of used) {
    for (const [side, s] of sidesOf(t)) {
      const i = mcfg.vald_band_labels.indexOf(s.band);
      if (i === -1) continue;
      scores.push(mcfg.vald_band_midpoints[i]);
      from.push({ test: t.label, side, band: s.band });
    }
  }
  return scores.length ? { value: pyRound(mean(scores)), from } : { value: null, from: [], measuredNotRated: used.map(t => t.label) };
};

/** General / Gym clients (no sport): the Dynamo tests that count. */
const generalBattery = (mcfg = loadMachineConfig()) =>
  Object.fromEntries(mcfg.general_dynamo_tests.map(k => [k, { source: 'vald', dynamo: true }]));

/**
 * tests:   input tests (above)
 * battery: the sport config's tests object, or generalBattery() (which Dynamo tests count)
 * Returns { config_version, stats, locked, ovr }.
 */
const scoreMachineCard = (tests, battery, { useProposed = false, mcfg = loadMachineConfig() } = {}) => {
  const dyn = dynamoKeys(battery);
  const dynamoTests = tests.filter(t => dyn.includes(t.key));
  const stats = {};

  // Strength: every percentile on the battery's Dynamo tests.
  const pcts = [];
  const strengthFrom = [];
  for (const t of dynamoTests) {
    for (const [side, s] of sidesOf(t)) {
      if (!isSet(s.percentile)) continue;
      pcts.push(s.percentile);
      strengthFrom.push({ test: t.label, side, percentile: s.percentile });
    }
  }
  stats.strength = pcts.length
    ? { value: pyRound(throughAnchors(mean(pcts), mcfg.vald_percentile_anchors, mcfg.score_floor, mcfg.score_cap)), averagePercentile: pyRound(mean(pcts), 1), from: strengthFrom }
    : { value: null, from: [] };

  // Symmetry: LSI per Dynamo test with both sides.
  const sym = [];
  for (const t of dynamoTests) {
    const l = t.sides?.left?.value;
    const r = t.sides?.right?.value;
    if (!isSet(l) || !isSet(r) || Math.max(l, r) <= 0) continue;
    const lsi = pyRound(Math.min(l, r) / Math.max(l, r) * 100, 1);
    sym.push({ test: t.label, lsi, score: throughAnchors(lsi, mcfg.symmetry.lsi_anchors, mcfg.score_floor, mcfg.score_cap) });
  }
  stats.symmetry = sym.length
    ? { value: pyRound(mean(sym.map(s => s.score))), from: sym.map(s => ({ ...s, score: pyRound(s.score, 1) })), proposed: mcfg.symmetry.status === 'proposed' }
    : { value: null, from: [], proposed: mcfg.symmetry.status === 'proposed' };

  stats.balance = bandStat(tests, mcfg.balance_tests, mcfg);
  stats.movement = bandStat(tests, mcfg.movement_tests, mcfg);
  stats.mobility = bandStat(tests, mcfg.mobility_tests, mcfg);

  // OVR: plain average of the scored stats (a proposed stat only if allowed).
  const counted = mcfg.stats.filter(k => isSet(stats[k].value) && (useProposed || !stats[k].proposed));
  const reasons = mcfg.stats.filter(k => !counted.includes(k))
    .map(k => (isSet(stats[k].value) ? `${k}: proposed, not counted` : `${k}: not tested`));
  const ovr = counted.length >= mcfg.ovr_min_stats
    ? { value: pyRound(mean(counted.map(k => stats[k].value))), counted, reasons }
    : { value: null, status: 'unrated', counted, reasons, message: `Rating pending: ${counted.length} of ${mcfg.stats.length} stats scored (needs ${mcfg.ovr_min_stats})` };

  return {
    config_version: mcfg.config_version,
    stats,
    locked: Object.fromEntries(Object.entries(mcfg.locked).map(([k, text]) => [k, { value: null, status: 'locked', text }])),
    ovr
  };
};

module.exports = { scoreMachineCard, loadMachineConfig, generalBattery, throughAnchors };

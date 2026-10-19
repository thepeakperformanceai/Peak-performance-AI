// scoring/scoring.js
// PeakPerformance OVR scoring engine (Football Scoring Spec v1).
//
// JavaScript port of peakperformance_scoring/scoring.py. Same inputs + same
// config always give the same scores, and the parity check
// (scripts/scoring-parity.js) proves this matches the Python engine exactly.
// Gemini never calls this; it only receives the payload this produces.
//
// Benchmarks, weights and thresholds live in football_v1.json — change
// numbers there, not here. That file must stay identical to
// peakperformance_scoring/football_v1.json (a test enforces it).
//
// Input shape (one testing session):
// {
//   athlete: { id, age, sex, position },
//   timing_method: 'hand' | 'electronic',
//   tests: {
//     sprint_30m:     { status: 'completed', value: 4.21 },
//     cod_505:        { status: 'completed', left: 2.52, right: 2.47 },   // best of both feet
//     knee_extension: { status: 'completed', left: 612, right: 533, cutoffs: [200, 300, 450, 600] },
//     overhead_squat: { status: 'completed', value: 70, band: 'within_normal' },
//     ...
//   }
// }
// Statuses: completed, not_done, injured, equipment_fault, invalid.

const STATUSES = new Set(['completed', 'not_done', 'injured', 'equipment_fault', 'invalid']);

// One config per sport. Football's must stay identical to the Python engine's.
const CONFIG_FILES = { football: './football_v1.json', padel: './padel_v1.json', cricket: './cricket_v1.json' };
const loadConfig = (sport = 'football') => {
  const file = CONFIG_FILES[sport];
  if (!file) throw new Error(`no scoring config for sport "${sport}"`);
  return require(file);
};

// ---------- Python-compatible rounding ----------

// Python's round(x, n): rounds the exact binary value of x, ties to even.
// JS Math.round rounds ties up and works on x * 10^n (which is inexact), so
// it gives different answers on values like 0.25 or 72.5. Every rounded
// number in the payload goes through this so the two engines agree exactly.
const pyRound = (x, ndigits = 0) => {
  if (!Number.isFinite(x) || x === 0) return x;
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  const hi = view.getUint32(0);
  const lo = view.getUint32(4);
  const negative = hi >>> 31 === 1;
  const expBits = (hi >>> 20) & 0x7ff;
  let mantissa = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  let exp;
  if (expBits === 0) {
    exp = -1074;                       // subnormal
  } else {
    mantissa |= 1n << 52n;
    exp = expBits - 1075;
  }
  // |x| = mantissa * 2^exp exactly; scale by 10^ndigits and round to integer.
  let num = mantissa * 10n ** BigInt(ndigits);
  let den = 1n;
  if (exp >= 0) num <<= BigInt(exp);
  else den <<= BigInt(-exp);
  let q = num / den;
  const twiceRem = (num % den) * 2n;
  if (twiceRem > den || (twiceRem === den && q % 2n === 1n)) q += 1n;
  const result = Number(q) / 10 ** ndigits;
  return negative ? -result : result;
};

// ---------- core maths ----------

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// Straight-line interpolation through (xs, ss); xs ascending.
// Outside the range, extends the nearest segment's slope, then clamps.
const piecewise = (x, xs, ss, floor, cap) => {
  let s;
  if (x <= xs[0]) {
    const slope = (ss[1] - ss[0]) / (xs[1] - xs[0]);
    s = ss[0] + slope * (x - xs[0]);
  } else if (x >= xs[xs.length - 1]) {
    const n = xs.length;
    const slope = (ss[n - 1] - ss[n - 2]) / (xs[n - 1] - xs[n - 2]);
    s = ss[n - 1] + slope * (x - xs[n - 1]);
  } else {
    for (let i = 0; i < xs.length - 1; i++) {
      if (xs[i] <= x && x <= xs[i + 1]) {
        s = ss[i] + (ss[i + 1] - ss[i]) * (x - xs[i]) / (xs[i + 1] - xs[i]);
        break;
      }
    }
  }
  return clamp(s, floor, cap);
};

// Manual tests. anchors = [[raw_value, card_score], ...].
// Works for lower-is-better and higher-is-better automatically.
const scoreFromAnchors = (value, anchors, floor = 25, cap = 99) => {
  const pts = [...anchors].sort((a, b) => a[1] - b[1]);
  const higherBetter = pts[pts.length - 1][0] > pts[0][0];
  const sign = higherBetter ? 1 : -1;
  const xs = pts.map(p => sign * p[0]);
  const ss = pts.map(p => p[1]);
  return piecewise(sign * value, xs, ss, floor, cap);
};

// 4 VALD cut-offs -> 6 edges; open-ended outer bands take the width of
// their neighbouring band.
const valdBandEdges = (c) =>
  [c[0] - (c[1] - c[0]), c[0], c[1], c[2], c[3], c[3] + (c[3] - c[2])];

const isAscending = (arr) => arr.every((v, i) => i === 0 || arr[i - 1] <= v);

// VALD tests: position within the band between its cut-offs.
const scoreFromVald = (value, cutoffs, cfg, higherIsBetter = true) => {
  if (cutoffs.length !== 4 || !isAscending(cutoffs)) {
    throw new Error('cutoffs must be 4 ascending values');
  }
  let edges = valdBandEdges(cutoffs);
  if (!higherIsBetter) {
    edges = edges.map(e => -e).reverse();
    value = -value;
  }
  return piecewise(value, edges, cfg.vald_band_edge_scores, cfg.score_floor, cfg.score_cap);
};

// 0 = well_below ... 4 = well_above.
const valdBandIndex = (value, cutoffs, higherIsBetter = true) =>
  higherIsBetter
    ? cutoffs.filter(c => value > c).length
    : cutoffs.filter(c => value < c).length;

// The better of two results on a manual scale (lower is better for times).
const bestOf = (values, anchors) => {
  const pts = [...anchors].sort((a, b) => a[1] - b[1]);
  return pts[pts.length - 1][0] > pts[0][0] ? Math.max(...values) : Math.min(...values);
};

const plausible = (value, rng) => rng == null || (rng[0] <= value && value <= rng[1]);

const isSet = (v) => v !== undefined && v !== null;

// ---------- per-test scoring ----------

// Returns [score, partial, bandIndex] for one value/side.
const scoreValdSide = (value, testIn, sideBandKey, cfg) => {
  const hib = isSet(testIn.higher_is_better) ? testIn.higher_is_better : true;
  const cutoffs = testIn.cutoffs;
  if (cutoffs && cutoffs.length) {
    return [scoreFromVald(value, cutoffs, cfg, hib), false, valdBandIndex(value, cutoffs, hib)];
  }
  const label = testIn[sideBandKey] || testIn.band;
  if (!isSet(label)) return [null, false, null];
  const i = cfg.vald_band_labels.indexOf(label);
  if (i === -1) throw new Error(`unknown VALD band ${label}`);
  return [cfg.vald_band_midpoints[i], true, i];
};

const scoreTest = (name, testIn, tdef, cfg, timingMethod) => {
  const out = {
    name,
    status: 'status' in testIn ? testIn.status : 'not_done',
    score: null,
    partial: false,
    benchmark: null
  };
  if (!STATUSES.has(out.status)) throw new Error(`${name}: unknown status ${out.status}`);
  if (out.status !== 'completed') return out;

  const rng = isSet(tdef.plausible) ? tdef.plausible : null;

  if (tdef.source === 'manual') {
    out.benchmark = 'research';
    let raw;
    if (tdef.best_of_left_right) {
      // Timed both ways (e.g. 5-0-5 turning off each foot): both kept, the better one scored.
      const left = isSet(testIn.left) ? testIn.left : null;
      const right = isSet(testIn.right) ? testIn.right : null;
      out.raw_left = left;
      out.raw_right = right;
      const sides = [left, right].filter(v => v !== null);
      if (!sides.length || sides.some(v => !plausible(v, rng))) {
        out.status = 'invalid';
        return out;
      }
      raw = bestOf(sides, cfg.manual_anchors[name]);
      out.raw = raw;
    } else {
      raw = testIn.value;
      out.raw = raw;
    }
    if (!plausible(raw, rng)) {
      out.status = 'invalid';
      return out;
    }
    let value = raw;
    if (name.startsWith('sprint_') && timingMethod === 'hand') {
      value = raw + cfg.hand_timing_offset_s;
      out.timing = 'hand';
    }
    // Measured but no agreed benchmark yet (config: benchmark_pending):
    // keep the raw result, give no score. Never estimated.
    if (tdef.benchmark_pending) {
      out.benchmark = 'pending';
      return out;
    }
    out.score = pyRound(scoreFromAnchors(value, cfg.manual_anchors[name],
      cfg.score_floor, cfg.score_cap), 1);
    return out;
  }

  // VALD tests
  out.benchmark = 'vald_age_sex';
  if (tdef.bilateral) {
    const left = isSet(testIn.left) ? testIn.left : null;
    const right = isSet(testIn.right) ? testIn.right : null;
    out.raw_left = left;
    out.raw_right = right;
    const sides = [[left, 'band_left'], [right, 'band_right']].filter(([v]) => v !== null);
    if (!sides.length) {
      out.status = 'invalid';
      return out;
    }
    if (sides.some(([v]) => !plausible(v, rng))) {
      out.status = 'invalid';
      return out;
    }
    const scores = [];
    const bands = [];
    for (const [v, key] of sides) {
      const [s, partial, b] = scoreValdSide(v, testIn, key, cfg);
      if (s === null) {
        out.status = 'invalid';
        return out;
      }
      scores.push(s);
      bands.push(b);
      out.partial = out.partial || partial;
    }
    out.score = pyRound(scores.reduce((a, b) => a + b, 0) / scores.length, 1);
    out.bands = bands;
    out.one_side_only = sides.length === 1;
    if (left !== null && right !== null && Math.max(left, right) > 0) {
      out.lsi = pyRound(Math.min(left, right) / Math.max(left, right) * 100, 1);
    }
  } else {
    const v = isSet(testIn.value) ? testIn.value : null;
    out.raw = v;
    if (v === null || !plausible(v, rng)) {
      out.status = 'invalid';
      return out;
    }
    const [s, partial, b] = scoreValdSide(v, testIn, 'band', cfg);
    if (s === null) {
      out.status = 'invalid';
      return out;
    }
    out.score = pyRound(s, 1);
    out.partial = partial;
    out.bands = [b];
  }
  return out;
};

// ---------- flags ----------

const buildFlags = (tests, cfg, athlete = {}) => {
  const flags = [];
  const lsiCfg = cfg.lsi;
  const fcfg = cfg.flags;
  for (const [name, t] of Object.entries(tests)) {
    if (t.status !== 'completed') continue;
    const tdef = cfg.tests[name];
    if (t.one_side_only) {
      flags.push({ type: 'one_side_only', test: name, level: 'amber' });
    }
    if (tdef.dynamo && 'lsi' in t) {
      // Racket sports (config: dominant_arm_tests): a gap where the weaker side
      // is the dominant arm is common and only flagged to monitor (never red,
      // so it never triggers the Power cap). Football has no such tests.
      const weaker = t.raw_left < t.raw_right ? 'L' : t.raw_right < t.raw_left ? 'R' : null;
      const dominantWeaker = (cfg.dominant_arm_tests || []).includes(name) &&
        weaker !== null && weaker === athlete.dominant_hand;
      if (dominantWeaker && t.lsi < lsiCfg.amber_below) {
        flags.push({ type: 'LSI', test: name, value: t.lsi, level: 'monitor', dominant_side_weaker: true });
      } else if (t.lsi < lsiCfg.red_below) {
        flags.push({ type: 'LSI', test: name, value: t.lsi, level: 'red' });
      } else if (t.lsi < lsiCfg.amber_below) {
        flags.push({ type: 'LSI', test: name, value: t.lsi, level: 'amber' });
      }
    }
    const l = isSet(t.raw_left) ? t.raw_left : null;
    const r = isSet(t.raw_right) ? t.raw_right : null;
    if (name === 'single_leg_stand' && l !== null && r !== null) {
      if (Math.abs(l - r) > fcfg.sls_side_diff_s) {
        flags.push({ type: 'asymmetry', test: name, value: Math.abs(l - r), level: 'amber' });
      }
    }
    if (name === 'trunk_rotation') {
      const low = [l, r].some(v => v !== null && v < fcfg.trunk_rotation_min_deg);
      const diff = l !== null && r !== null && Math.abs(l - r) > fcfg.trunk_rotation_side_diff_deg;
      if (low || diff) flags.push({ type: 'mobility', test: name, level: 'amber' });
    }
    if (name === 'overhead_squat' && t.bands && isSet(t.bands[0]) && t.bands[0] < 2) {
      flags.push({ type: 'movement_quality', test: name, level: 'amber' });
    }
  }
  // Throwing/bowling arm balance (config: arm_ratio), e.g. shoulder ER:IR on
  // the dominant arm only.
  const ar = cfg.arm_ratio;
  if (ar && (athlete.dominant_hand === 'L' || athlete.dominant_hand === 'R')) {
    const side = athlete.dominant_hand === 'L' ? 'raw_left' : 'raw_right';
    const num = tests[ar.numerator];
    const den = tests[ar.denominator];
    if (num && den && num.status === 'completed' && den.status === 'completed' &&
        isSet(num[side]) && isSet(den[side]) && den[side] > 0 && num[side] / den[side] < ar.amber_below) {
      flags.push({ type: ar.type, test: ar.numerator, value: pyRound(num[side] / den[side] * 100, 1), level: 'amber' });
    }
  }

  // Hip adduction vs abduction (config: groin_ratio). Mean of the sides entered.
  const gr = cfg.groin_ratio;
  if (gr) {
    const add = tests[gr.numerator];
    const abd = tests[gr.denominator];
    const sideMean = (t) => {
      const sides = [t.raw_left, t.raw_right].filter(isSet);
      return sides.length ? sides.reduce((a, b) => a + b, 0) / sides.length : null;
    };
    if (add && abd && add.status === 'completed' && abd.status === 'completed') {
      const a = sideMean(add);
      const b = sideMean(abd);
      if (a !== null && b !== null && b > 0 && a / b < gr.amber_below) {
        flags.push({ type: 'groin_risk', test: gr.numerator, value: pyRound(a / b * 100, 1), level: 'amber' });
      }
    }
  }
  return flags;
};

// ---------- stats and OVR ----------

const scoreSession = (session, cfg = loadConfig()) => {
  const timing = isSet(session.timing_method) ? session.timing_method : 'electronic';
  const athlete = session.athlete || {};
  const testsIn = session.tests || {};

  const tests = {};
  for (const [name, tdef] of Object.entries(cfg.tests)) {
    tests[name] = scoreTest(name, testsIn[name] || { status: 'not_done' }, tdef, cfg, timing);
  }

  // stats
  const stats = {};
  for (const stat of Object.keys(cfg.stat_weights)) {
    if (cfg.stats_not_in_battery.includes(stat)) {
      stats[stat] = { value: null, status: 'not_in_battery' };
      continue;
    }
    const feeders = Object.entries(cfg.tests).filter(([, d]) => d.stat === stat);
    const got = feeders
      .filter(([n]) => tests[n].score !== null)
      .map(([n, d]) => [tests[n].score, d.stat_weight, tests[n].partial]);
    if (!got.length) {
      const pending = feeders.some(([n]) => tests[n].benchmark === 'pending');
      stats[stat] = { value: null, status: pending ? 'benchmark_pending' : 'not_tested' };
      continue;
    }
    const wsum = got.reduce((a, [, w]) => a + w, 0);
    const val = got.reduce((a, [s, w]) => a + s * w, 0) / wsum;
    const partial = got.length < feeders.length || got.some(([, , p]) => p);
    stats[stat] = { value: val, partial };
  }

  // power cap for strong-side masking
  const flags = buildFlags(tests, cfg, athlete);
  if (stats.power && stats.power.value !== null) {
    if (flags.some(f => f.type === 'LSI' && f.level === 'red')) {
      if (stats.power.value > cfg.lsi.power_cap) {
        stats.power.value = cfg.lsi.power_cap;
        stats.power.capped = true;
      }
    }
  }

  // OVR
  const totalW = Object.values(cfg.stat_weights).reduce((a, b) => a + b, 0);
  const avail = Object.entries(stats).filter(([, v]) => v.value !== null).map(([k, v]) => [k, v.value]);
  const aw = avail.reduce((a, [k]) => a + cfg.stat_weights[k], 0);
  const reasons = [];
  for (const [name, t] of Object.entries(tests)) {
    if (t.status !== 'completed') reasons.push(`${name}: ${t.status}`);
    else if (t.benchmark === 'pending') reasons.push(`${name}: benchmark_pending`);
  }
  if (cfg.provisional_sexes.includes(athlete.sex)) {
    reasons.push('benchmarks are adult male only');
  }
  if (isSet(athlete.age) && athlete.age < cfg.provisional_under_age) {
    reasons.push('benchmarks are adult only');
  }

  let ovr;
  if (avail.length >= cfg.ovr_min_stats && aw / totalW >= cfg.ovr_min_weight_share) {
    const ovrVal = pyRound(avail.reduce((a, [k, v]) => a + cfg.stat_weights[k] * v, 0) / aw);
    ovr = { value: ovrVal, provisional: reasons.length > 0, reasons };
  } else {
    ovr = { value: null, status: 'pending', message: 'OVR pending: complete testing', reasons };
  }

  for (const v of Object.values(stats)) {
    if (isSet(v.value)) v.value = pyRound(v.value);
  }

  return {
    athlete,
    sport: cfg.sport,
    config_version: cfg.config_version,
    ovr,
    stats,
    tests: Object.values(tests),
    flags
  };
};

module.exports = {
  STATUSES,
  loadConfig,
  pyRound,
  scoreFromAnchors,
  scoreFromVald,
  valdBandIndex,
  bestOf,
  scoreTest,
  buildFlags,
  scoreSession
};

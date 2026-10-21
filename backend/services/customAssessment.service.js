// services/customAssessment.service.js
// "Custom assessment": the tester picks the tests (any of the athlete's VALD
// tests plus manual tests from a list). A scoring config is built for that
// session and run through the same engine as football, padel and cricket,
// whose configs are never touched.
//
//   Manual tests  -> scored by the existing research anchors (from the chosen
//                    sport's config, or the only config that has that test).
//   VALD tests    -> scored by VALD's percentile / band (or cut-offs), as in every battery.
//   Stats         -> VALD tests feed the stat set on the "VALD test mapping"
//                    admin screen (battery tests keep their usual stat unless
//                    an admin changed it). Unmapped / "show only" VALD tests
//                    are shown on the report, never scored.
//   OVR           -> equal weight for every stat that has a score; only shown
//                    with 3 or more scored stats ("No OVR: custom session"
//                    otherwise). Provisional rules as in the other sports.

const { loadConfig } = require('../scoring/scoring');

const SPORTS = ['football', 'padel', 'cricket'];
const STATS = ['speed', 'power', 'agility', 'endurance', 'balance', 'reaction'];
const configs = () => Object.fromEntries(SPORTS.map(s => [s, loadConfig(s)]));

// Manual tests a tester can add, with the label used on the report.
const MANUAL_TESTS = {
  sprint_10m: { label: '10m Sprint', unit: 's' },
  sprint_20m: { label: '20m Sprint', unit: 's' },
  sprint_30m: { label: '30m Sprint', unit: 's' },
  ruler_drop: { label: 'Ruler Drop', unit: 'cm' },
  cod_505: { label: '505 Agility', unit: 's' },
  medicine_ball: { label: 'Medicine Ball Throw (seated, 4 kg)', unit: 'm' }
};

/**
 * Where a manual test's anchors come from: the chosen sport if its config
 * has the test, otherwise the first sport (football, padel, cricket) that does.
 */
const manualSource = (key, benchmarkSport, all = configs()) => {
  const order = [benchmarkSport, ...SPORTS.filter(s => s !== benchmarkSport)].filter(s => SPORTS.includes(s));
  // Anchors a sport borrows from another (football and padel 5-0-5 from cricket)
  // are taken from the original, which also takes one time, not one per foot.
  return order.find(s => all[s].tests[key]?.source === 'manual' && !all[s].tests[key]?.citation?.borrowed_from) || null;
};

/** The manual test list for the form: key, label, unit, which sport's norms. */
const manualLibrary = (benchmarkSport = 'football') => {
  const all = configs();
  return Object.entries(MANUAL_TESTS).map(([key, info]) => {
    const from = manualSource(key, benchmarkSport, all);
    const tdef = all[from].tests[key];
    return { key, ...info, stat: tdef.stat, benchmarkFrom: from, benchmarkPending: !!tdef.benchmark_pending, plausible: tdef.plausible };
  });
};

// Every VALD battery test across the three sports (same definition in each).
const valdBattery = (all = configs()) => {
  const out = {};
  for (const s of SPORTS) {
    for (const [k, t] of Object.entries(all[s].tests)) if (t.source === 'vald' && !out[k]) out[k] = t;
  }
  return out;
};

// Stat for a VALD test: the admin's mapping first; for battery tests with no
// mapping, the stat that test already has in the sport configs. Otherwise
// none (shown, not scored). Never guessed.
const valdStat = (valdKey, batteryKey, mappings, battery) => {
  const m = mappings[valdKey];
  if (m) return { stat: m.use === 'stat' && STATS.includes(m.stat) ? m.stat : null, statSource: m.use === 'stat' ? 'mapping' : 'show_only' };
  const b = batteryKey && battery[batteryKey];
  if (b && b.stat) return { stat: b.stat, statSource: 'built_in' };
  return { stat: null, statSource: 'unmapped' };
};

const VALD_KEY = /^(dynamo|humantrak):[\w.-]{1,120}$/;
const CUSTOM_VALD_KEY = /^vald_[a-z0-9_]{1,100}$/;
const customKeyFor = (valdKey) => `vald_${String(valdKey).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`.slice(0, 105);

const badRequest = (msg) => {
  const err = new Error(msg);
  err.statusCode = 400;
  return err;
};

const clean = (v, n) => String(v ?? '').trim().slice(0, n);

/**
 * VALD pull for a custom session: every latest VALD test as a form test.
 * mapped = mapLatestResults(...) run against all VALD battery tests.
 */
const valdFormTests = (mapped, mappings = {}) => {
  const battery = valdBattery();
  const tests = [];
  for (const [key, fill] of Object.entries(mapped.fills)) {
    const src = mapped.sources[key] || {};
    tests.push({
      key, kind: 'vald', valdKey: src.key || null, batteryKey: key, device: src.device, label: null,
      bilateral: !!battery[key].bilateral, date: src.date, ...fill,
      ...valdStat(src.key, key, mappings, battery)
    });
  }
  for (const a of mapped.additional) {
    if (a.needsMetric) continue;                     // no value until an admin picks the metric
    tests.push({
      key: customKeyFor(a.key), kind: 'vald', valdKey: a.key, batteryKey: null, device: a.device, label: a.test, unit: a.unit,
      bilateral: a.left !== undefined || a.right !== undefined, date: a.date,
      ...(a.left !== undefined ? { left: a.left } : {}), ...(a.right !== undefined ? { right: a.right } : {}),
      ...(a.value !== undefined ? { value: a.value } : {}),
      ...valdStat(a.key, null, mappings, battery)
    });
  }
  const waiting = mapped.additional.filter(a => a.needsMetric).map(a => a.test);
  return { tests, waiting, unmatched: mapped.unmatched };
};

/**
 * Builds the session's scoring config from the tester's test list.
 *   testsIn:  [{ key, kind: 'manual' | 'vald', valdKey, label, unit, bilateral, device }]
 *   mappings: admin choices by VALD key ({ use, stat })
 * Returns { cfg, testInfo, shownOnly } — shownOnly are the VALD tests with no
 * stat (shown on the report, not scored).
 */
const buildCustomConfig = ({ testsIn = [], benchmarkSport = 'football', mappings = {} }) => {
  if (!SPORTS.includes(benchmarkSport)) throw badRequest('Benchmark sport must be football, padel or cricket');
  if (!Array.isArray(testsIn) || !testsIn.length) throw badRequest('Add at least one test');
  if (testsIn.length > 80) throw badRequest('Too many tests (80 at most)');
  const all = configs();
  const base = all.football;
  const battery = valdBattery(all);

  const tests = {};
  const anchors = {};
  const testInfo = {};
  const shownOnly = [];
  const seen = new Set();
  for (const t of testsIn) {
    const key = clean(t?.key, 110);
    if (seen.has(key)) throw badRequest(`Test listed twice: ${key}`);
    seen.add(key);

    if (t.kind === 'manual') {
      if (!MANUAL_TESTS[key]) throw badRequest(`Unknown manual test: ${key}`);
      const from = manualSource(key, benchmarkSport, all);
      const src = all[from].tests[key];
      tests[key] = {
        source: 'manual', bilateral: false, stat: src.stat, stat_weight: 1.0, plausible: src.plausible,
        ...(src.benchmark_pending ? { benchmark_pending: true } : {}), benchmark_from: from,
        ...(src.citation ? { citation: src.citation } : {})
      };
      if (all[from].manual_anchors[key]) anchors[key] = all[from].manual_anchors[key];
      testInfo[key] = { label: MANUAL_TESTS[key].label, unit: MANUAL_TESTS[key].unit };
      continue;
    }

    if (t.kind !== 'vald') throw badRequest(`Unknown test kind for ${key}`);
    const valdKey = clean(t.valdKey, 130);
    if (!VALD_KEY.test(valdKey)) throw badRequest(`Unknown VALD test for ${key}`);
    const isBattery = !!battery[key];
    if (!isBattery && !CUSTOM_VALD_KEY.test(key)) throw badRequest(`Unknown VALD test key: ${key}`);
    const { stat } = valdStat(valdKey, isBattery ? key : null, mappings, battery);
    const label = isBattery ? null : (clean(t.label, 120) || 'VALD test');
    const unit = isBattery ? null : clean(t.unit, 16);
    if (!stat) {
      shownOnly.push({ key, valdKey, label, unit, device: t.device === 'Dynamo' ? 'Dynamo' : 'HumanTrak', bilateral: isBattery ? !!battery[key].bilateral : !!t.bilateral });
      continue;
    }
    const device = isBattery ? (battery[key].dynamo ? 'Dynamo' : 'HumanTrak') : (t.device === 'Dynamo' ? 'Dynamo' : 'HumanTrak');
    tests[key] = isBattery
      ? { ...battery[key], stat, stat_weight: 1.0 }
      : {
          source: 'vald',
          bilateral: !!t.bilateral,
          ...(device === 'Dynamo' ? { dynamo: true } : {}),
          stat,
          stat_weight: 1.0,
          // Generous sanity ranges: force in N, angles in degrees; others unchecked.
          plausible: unit === 'N' ? [5, 5000] : unit === '°' ? [0, 360] : null
        };
    if (!isBattery) testInfo[key] = { label, unit };
  }

  if (!Object.keys(tests).length && !shownOnly.length) throw badRequest('Add at least one test');

  const cfg = {
    config_version: 'custom-v1',
    sport: 'custom',
    benchmark_sport: benchmarkSport,
    hand_timing_offset_s: base.hand_timing_offset_s,
    hand_timing_citation: base.hand_timing_citation,
    // Citations shown on the methodology page (never used in scoring).
    references: Object.assign({}, ...SPORTS.map(sp => all[sp].references || {})),
    score_floor: base.score_floor,
    score_cap: base.score_cap,
    manual_anchors: anchors,
    vald_band_labels: base.vald_band_labels,
    vald_band_edge_scores: base.vald_band_edge_scores,
    vald_band_midpoints: base.vald_band_midpoints,
    vald_percentile_anchors: base.vald_percentile_anchors,
    tests,
    // Equal weights: the OVR is the plain mean of the stats that have a score.
    stat_weights: Object.fromEntries(STATS.map(s => [s, 1])),
    stats_not_in_battery: [],
    lsi: base.lsi,
    flags: base.flags,
    // Arm and groin balance flags work when both tests are in the session.
    arm_ratio: all.cricket.arm_ratio,
    groin_ratio: all.padel.groin_ratio,
    ovr_min_stats: 3,
    ovr_min_weight_share: 3 / STATS.length,
    provisional_under_age: base.provisional_under_age,
    provisional_sexes: base.provisional_sexes
  };
  return { cfg, testInfo, shownOnly };
};

module.exports = { buildCustomConfig, manualLibrary, valdFormTests, valdBattery, customKeyFor, MANUAL_TESTS, STATS };

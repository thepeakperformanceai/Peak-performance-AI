// services/vald/valdMapping.js
// Turns an athlete's VALD Dynamo and HumanTrak tests into:
//   - fills:      raw results for the sport's battery tests (scored as before)
//   - additional: every other VALD test, for "Additional VALD results" on the
//                 report (never scored, never in the OVR)
// using the most recent result per test and per side.
//
// Only raw results are filled. VALD band cut-offs are not in these API
// responses, so the tester still enters the cut-offs or band; the engine
// scores nothing until they do.
//
// Field names follow VALD's External DynaMo / HumanTrak API guides and VALD's
// own R package (valdr):
//   Dynamo test:  bodyRegion ("Knee"), movement ("Extension"), position,
//                 laterality, startTimeUTC, repetitionTypeSummaries[] with
//                 movement, laterality (LeftSide / RightSide), maxForceNewtons,
//                 maxRangeOfMotionDegrees
//   HumanTrak:    testTypeCode, startDateUtc, metricGroups[] with code,
//                 longName, summaryMeasurements[] { side, unit,
//                 aggregates { max, min, avg } }; names for testTypeCode come
//                 from /v2/test-type/metrics.
// Nothing is guessed: a result whose fields aren't clear is reported back,
// never filled.

const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const label = (s) => String(s || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim();
const round1 = (n) => Math.round(Number(n) * 10) / 10;
const isNum = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

const testDate = (t) => t.startTimeUTC || t.startDateUtc || t.testDateUtc || t.recordedDateUtc || t.modifiedDateUtc || null;

// "LeftSide" / "Left" -> left; "RightSide" / "Right" -> right; anything else
// ("Both", "NotApplicable", none) is a single value.
const sideOf = (v) => {
  const s = slug(v);
  if (s.startsWith('left')) return 'left';
  if (s.startsWith('right')) return 'right';
  return 'value';
};

// ---------- Dynamo ----------

// Body region + movement (joined, normalised) -> battery test.
const DYNAMO_BATTERY = {
  hipextension: 'hip_extension',
  kneeextension: 'knee_extension',
  shoulderexternalrotation: 'shoulder_er',
  shoulderinternalrotation: 'shoulder_ir',
  elbowextension: 'elbow_extension',
  hipabduction: 'hip_abduction',
  hipadduction: 'hip_adduction'
};

// "Knee" + "Extension" -> "kneeextension". Older records that carry the
// region inside the movement ("HipExtension") give the same key.
const dynamoId = (region, movement) => {
  const r = slug(region);
  const m = slug(movement);
  return r && !m.startsWith(r) ? r + m : m;
};

/** One Dynamo test -> one result per movement in it (a test can hold several). */
const normaliseDynamo = (t) => {
  const summaries = Array.isArray(t.repetitionTypeSummaries) ? t.repetitionTypeSummaries : [];
  const byMovement = new Map();
  for (const s of summaries) {
    const mv = s.movement || t.movement || '';
    if (!byMovement.has(mv)) byMovement.set(mv, []);
    byMovement.get(mv).push(s);
  }
  if (!byMovement.size) byMovement.set(t.movement || '', []);
  return [...byMovement.entries()].map(([movement, group]) => {
    const force = group.some(s => isNum(s.maxForceNewtons));
    const field = force ? 'maxForceNewtons' : 'maxRangeOfMotionDegrees';
    const values = {};
    for (const s of group) {
      if (!isNum(s[field])) continue;
      const side = sideOf(s.laterality);
      values[side] = Math.max(values[side] ?? -Infinity, Number(s[field]));
    }
    const id = dynamoId(t.bodyRegion, movement);
    return {
      key: `dynamo:${id}`,
      battery: DYNAMO_BATTERY[id] || null,
      device: 'Dynamo',
      test: [label(t.bodyRegion), label(movement)].filter(Boolean).join(' ').replace(/^(\w+) \1 /i, '$1 ') || 'Unknown Dynamo test',
      bodyRegion: t.bodyRegion || null,
      movement: movement || null,
      position: t.position || null,
      laterality: t.laterality || null,
      unit: force ? 'N' : '°',
      testId: t.id || t.testId || null,
      date: testDate(t),
      ...Object.fromEntries(Object.entries(values).map(([k, v]) => [k, round1(v)]))
    };
  });
};

// ---------- HumanTrak ----------

// Battery HumanTrak tests: test type name, and the words that identify the
// metric to use. Exactly one metric must match, unless an admin picked one.
const HUMANTRAK_BATTERY = [
  { key: 'single_leg_stand', kind: 'sides', type: (n) => n.includes('singlelegstand') && !n.includes('eyesopen'), metric: ['time', 'duration', 'hold'] },
  { key: 'trunk_rotation', kind: 'sides', type: (n) => n.includes('trunkrotation'), metric: ['rotation', 'range', 'angle', 'rom'] },
  { key: 'overhead_squat', kind: 'value', type: (n) => n.includes('overheadsquat'), metric: ['composite', 'score'] }
];

/** One HumanTrak test -> { key, test, metrics: [{ code, name, unit, left, right, value }] }. */
const normaliseHumanTrak = (t, testTypes = []) => {
  const type = testTypes.find(x => x.code && x.code === t.testTypeCode) || null;
  const name = type?.name || t.testTypeName || label(String(t.testTypeCode || '').replace(/^TT_/, '')) || 'Unknown HumanTrak test';
  const groups = Array.isArray(t.metricGroups) ? t.metricGroups : [];
  const metrics = groups.map(g => {
    const def = (type?.metricGroups || []).find(m => m.code === g.code) || {};
    // Best repetition: lowest when VALD says lower is better, otherwise highest.
    const lowerBetter = /lower|decrease|negative/i.test(String(g.trendSentiment || def.trendSentiment || ''));
    const agg = lowerBetter ? 'min' : 'max';
    const values = {};
    let unit = g.unit || def.unit || '';
    for (const m of (Array.isArray(g.summaryMeasurements) ? g.summaryMeasurements : [])) {
      const v = m.aggregates?.[agg] ?? m.aggregates?.avg;
      if (!isNum(v)) continue;
      values[sideOf(m.side)] = round1(v);
      unit = unit || m.unit || '';
    }
    return { code: g.code, name: g.longName || g.shortName || def.longName || def.shortName || label(g.code), unit, ...values };
  }).filter(m => m.left !== undefined || m.right !== undefined || m.value !== undefined);
  return {
    key: `humantrak:${t.testTypeCode || slug(name)}`,
    battery: HUMANTRAK_BATTERY.find(r => r.type(slug(name))) || null,
    device: 'HumanTrak',
    test: name,
    testTypeCode: t.testTypeCode || null,
    testId: t.testId || t.id || null,
    date: testDate(t),
    metrics
  };
};

// Which metric of a HumanTrak test to use. Admin choice first; for battery
// tests exactly one metric matching the rule's words; for other tests the
// only metric if there is just one. Otherwise null (never guessed).
const chooseMetric = (h, mapping) => {
  if (mapping?.metric) return h.metrics.find(m => m.code === mapping.metric) || null;
  const rule = h.battery;
  if (rule) {
    const fits = h.metrics.filter(m => rule.metric.some(w => slug(m.name).includes(w)) &&
      (rule.kind === 'sides' ? (m.left !== undefined || m.right !== undefined) : m.value !== undefined));
    return fits.length === 1 ? fits[0] : null;
  }
  return h.metrics.length === 1 ? h.metrics[0] : null;
};

// ---------- combine ----------

const SIDES = ['left', 'right', 'value'];

/**
 * Normalised results (newest first) -> one entry per test key, each side
 * taken from the most recent test that has it.
 */
const latestPerTestAndSide = (results) => {
  const out = new Map();
  for (const r of results) {
    if (!out.has(r.key)) out.set(r.key, { ...r, left: undefined, right: undefined, value: undefined, dates: {}, testIds: {} });
    const e = out.get(r.key);
    for (const side of SIDES) {
      if (r[side] === undefined || e[side] !== undefined) continue;
      e[side] = r[side];
      e.dates[side] = r.date;
      e.testIds[side] = r.testId;
    }
  }
  for (const e of out.values()) {
    const ds = Object.values(e.dates).filter(Boolean).sort();
    e.date = ds.length ? ds[ds.length - 1] : e.date;
    for (const side of SIDES) if (e[side] === undefined) delete e[side];
  }
  return [...out.values()];
};

const symmetry = (l, r) => (isNum(l) && isNum(r) && Math.max(l, r) > 0 ? round1(Math.min(l, r) / Math.max(l, r) * 100) : null);

const newestFirst = (a, b) => String(b.date || '').localeCompare(String(a.date || ''));

/**
 * Combine both devices for one sport's battery.
 *   battery:  the sport config's tests object
 *   mappings: admin choices by VALD test key { use: 'stat' | 'show', stat, metric }
 * Returns { fills, sources, missing, additional, unmatched }.
 */
const mapLatestResults = ({ dynamo = [], humantrak = [], testTypes = [] }, battery, mappings = {}) => {
  const wanted = new Set(Object.keys(battery).filter(k => battery[k].source === 'vald'));
  const unmatched = [];

  // Flatten to one entry per (test key, metric) with left/right/value.
  const flat = [];
  for (const t of dynamo) {
    for (const r of normaliseDynamo(t)) {
      if (r.left === undefined && r.right === undefined && r.value === undefined) {
        unmatched.push({ device: 'Dynamo', test: r.test, date: r.date, reason: 'no force or range of motion in the result' });
        continue;
      }
      flat.push({ ...r, target: r.battery });
    }
  }
  const htByKey = new Map();
  for (const t of humantrak) {
    const h = normaliseHumanTrak(t, testTypes);
    if (!htByKey.has(h.key)) htByKey.set(h.key, []);
    htByKey.get(h.key).push(h);
  }
  const needsMetric = new Map();
  for (const [key, list] of htByKey) {
    for (const h of list) {
      const m = chooseMetric(h, mappings[key]);
      if (!m) { if (!needsMetric.has(key)) needsMetric.set(key, h); continue; }
      flat.push({
        key, device: 'HumanTrak', test: h.test, metric: m.name, metricCode: m.code, unit: m.unit,
        testId: h.testId, date: h.date, target: h.battery?.key || null, kind: h.battery?.kind || null,
        ...SIDES.reduce((o, s) => (m[s] !== undefined ? { ...o, [s]: m[s] } : o), {})
      });
    }
  }
  flat.sort(newestFirst);
  const latest = latestPerTestAndSide(flat);

  const fills = {};
  const sources = {};
  const additional = [];
  for (const e of latest) {
    if (e.target && wanted.has(e.target)) {
      const bilateral = battery[e.target].bilateral;
      const fill = bilateral
        ? { ...(e.left !== undefined ? { left: e.left } : {}), ...(e.right !== undefined ? { right: e.right } : {}) }
        : (e.value !== undefined ? { value: e.value } : {});
      if (Object.keys(fill).length) {
        fills[e.target] = fill;
        sources[e.target] = { key: e.key, device: e.device, date: e.date, testId: e.testIds.left || e.testIds.right || e.testIds.value || null, test: e.test, ...(e.metric ? { metric: e.metric } : {}) };
        continue;
      }
      unmatched.push({ device: e.device, test: e.test, date: e.date, reason: bilateral ? 'no left/right result' : 'no single result (only left/right)' });
      continue;
    }
    const mapping = mappings[e.key] || null;
    additional.push({
      key: e.key,
      device: e.device,
      test: e.metric && e.metric !== e.test ? `${e.test} — ${e.metric}` : e.test,
      unit: e.unit || '',
      ...(e.left !== undefined ? { left: e.left } : {}),
      ...(e.right !== undefined ? { right: e.right } : {}),
      ...(e.value !== undefined ? { value: e.value } : {}),
      symmetry: symmetry(e.left, e.right),
      date: e.date,
      stat: mapping?.use === 'stat' ? mapping.stat : null,
      mapped: !!mapping
    });
  }

  // HumanTrak tests whose metric isn't clear: battery ones are reported for
  // the tester; others are listed (without values) until an admin picks a metric.
  for (const [key, h] of needsMetric) {
    if (latest.some(e => e.key === key)) continue;           // an older/newer copy resolved it
    const metrics = h.metrics.map(m => m.name);
    if (h.battery && wanted.has(h.battery.key)) {
      unmatched.push({ device: 'HumanTrak', test: h.test, date: h.date, reason: 'more than one possible result field, enter by hand or choose one in VALD test mapping', metrics });
    } else {
      additional.push({ key, device: 'HumanTrak', test: h.test, unit: '', symmetry: null, date: h.date, stat: null, mapped: !!mappings[key], needsMetric: true, metrics });
    }
  }

  additional.sort((a, b) => a.device.localeCompare(b.device) || a.test.localeCompare(b.test));
  return {
    fills,
    sources,
    missing: [...wanted].filter(k => !fills[k]),
    additional,
    unmatched
  };
};

/**
 * Every distinct VALD test type in a set of tests, for the admin mapping
 * screen: key, device, name, battery test (if built in), metrics (HumanTrak).
 */
const testTypesSeen = ({ dynamo = [], humantrak = [], testTypes = [] }) => {
  const out = new Map();
  for (const t of dynamo) {
    for (const r of normaliseDynamo(t)) {
      if (!out.has(r.key)) out.set(r.key, { key: r.key, device: 'Dynamo', test: r.test, bodyRegion: r.bodyRegion, movement: r.movement, battery: r.battery, unit: r.unit, count: 0, lastDate: null });
      const e = out.get(r.key);
      e.count++;
      if (String(r.date || '') > String(e.lastDate || '')) e.lastDate = r.date;
    }
  }
  for (const t of humantrak) {
    const h = normaliseHumanTrak(t, testTypes);
    if (!out.has(h.key)) out.set(h.key, { key: h.key, device: 'HumanTrak', test: h.test, testTypeCode: h.testTypeCode, battery: h.battery?.key || null, metrics: [], count: 0, lastDate: null });
    const e = out.get(h.key);
    e.count++;
    if (String(h.date || '') > String(e.lastDate || '')) e.lastDate = h.date;
    for (const m of h.metrics) if (!e.metrics.some(x => x.code === m.code)) e.metrics.push({ code: m.code, name: m.name, unit: m.unit });
  }
  return [...out.values()].sort((a, b) => a.device.localeCompare(b.device) || a.test.localeCompare(b.test));
};

/** Raw rows for the admin debug view: one row per test and movement/metric side. */
const rawRows = ({ dynamo = [], humantrak = [], testTypes = [] }) => {
  const rows = [];
  for (const t of dynamo) {
    const summaries = Array.isArray(t.repetitionTypeSummaries) ? t.repetitionTypeSummaries : [];
    const sides = summaries.length ? summaries : [{}];
    for (const s of sides) {
      rows.push({
        device: 'Dynamo', testId: t.id || t.testId || null, date: testDate(t),
        test: [label(t.bodyRegion), label(s.movement || t.movement)].filter(Boolean).join(' '),
        bodyRegion: t.bodyRegion || null, movement: s.movement || t.movement || null,
        position: t.position || null, testCategory: t.testCategory || null,
        side: s.laterality || t.laterality || null,
        maxForceN: isNum(s.maxForceNewtons) ? round1(s.maxForceNewtons) : null,
        maxRomDeg: isNum(s.maxRangeOfMotionDegrees) ? round1(s.maxRangeOfMotionDegrees) : null,
        reps: s.repCount ?? null
      });
    }
  }
  for (const t of humantrak) {
    const h = normaliseHumanTrak(t, testTypes);
    for (const g of (Array.isArray(t.metricGroups) ? t.metricGroups : [])) {
      for (const m of (Array.isArray(g.summaryMeasurements) ? g.summaryMeasurements : [{}])) {
        rows.push({
          device: 'HumanTrak', testId: h.testId, date: h.date, test: h.test, testTypeCode: h.testTypeCode,
          metric: g.longName || g.shortName || g.code, metricCode: g.code || null,
          side: m.side || null, unit: m.unit || g.unit || null,
          max: m.aggregates?.max ?? null, avg: m.aggregates?.avg ?? null, min: m.aggregates?.min ?? null
        });
      }
    }
    if (!(t.metricGroups || []).length) rows.push({ device: 'HumanTrak', testId: h.testId, date: h.date, test: h.test, testTypeCode: h.testTypeCode, metric: null, side: null });
  }
  return rows.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
};

module.exports = {
  mapLatestResults, testTypesSeen, rawRows,
  normaliseDynamo, normaliseHumanTrak, latestPerTestAndSide,
  DYNAMO_BATTERY, HUMANTRAK_BATTERY
};

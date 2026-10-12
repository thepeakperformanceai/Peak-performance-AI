// services/vald/valdMapping.js
// Turns VALD HumanTrak and Dynamo test results into the test form's fields
// (left / right / value) for one sport's battery.
//
// Only raw results are filled. VALD band cut-offs are not in these API
// responses, so the tester still enters the 4 cut-offs or the band from the
// VALD report; the engine scores nothing until they do.
//
// Field names follow VALD's published examples (Dynamo: movement, laterality,
// repetitionTypeSummaries[].maxForceNewtons). HumanTrak metric names are not
// fully published, so matching is by name pattern and anything that doesn't
// match clearly is returned as "unmatched" for the tester to enter by hand —
// never guessed.

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
const round1 = (n) => Math.round(Number(n) * 10) / 10;
const isNum = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

// Dynamo movement (normalised) -> our test key.
const DYNAMO_MOVEMENTS = {
  hipextension: 'hip_extension',
  kneeextension: 'knee_extension',
  shoulderexternalrotation: 'shoulder_er',
  shoulderinternalrotation: 'shoulder_ir',
  elbowextension: 'elbow_extension',
  hipabduction: 'hip_abduction',
  hipadduction: 'hip_adduction'
};

const testDate = (t) => t.startTimeUTC || t.testDateUtc || t.startDateUtc || t.recordedDateUtc || t.modifiedDateUtc || null;

/**
 * Dynamo: latest test per movement -> { left, right } max force (N).
 */
const mapDynamo = (tests, wanted) => {
  const fills = {};
  const sources = {};
  const unmatched = [];
  for (const t of tests) {                                  // newest first
    const summaries = Array.isArray(t.repetitionTypeSummaries) ? t.repetitionTypeSummaries : [];
    const key = DYNAMO_MOVEMENTS[norm(t.movement || summaries[0]?.movement)];
    if (!key || !wanted.has(key)) {
      unmatched.push({ device: 'Dynamo', test: t.movement || 'unknown', date: testDate(t), reason: key ? 'not in this battery' : 'movement not recognised' });
      continue;
    }
    if (fills[key]) continue;                               // keep the newest only
    const side = (lat) => summaries
      .filter(s => norm(s.laterality).startsWith(lat) && isNum(s.maxForceNewtons))
      .reduce((best, s) => Math.max(best, Number(s.maxForceNewtons)), -Infinity);
    const left = side('left');
    const right = side('right');
    if (left === -Infinity && right === -Infinity) {
      unmatched.push({ device: 'Dynamo', test: t.movement, date: testDate(t), reason: 'no left/right max force in the result' });
      continue;
    }
    fills[key] = {
      ...(left !== -Infinity ? { left: round1(left) } : {}),
      ...(right !== -Infinity ? { right: round1(right) } : {})
    };
    sources[key] = { device: 'Dynamo', testId: t.id || t.testId || null, date: testDate(t), movement: t.movement };
  }
  return { fills, sources, unmatched };
};

// HumanTrak metrics come as an array of { name|key|metric, value } or as an object.
const metricList = (t) => {
  const m = t.metrics || t.results || t.summaryMetrics || [];
  if (Array.isArray(m)) {
    return m.map(x => ({ name: x.name || x.key || x.metric || x.metricName || '', value: x.value ?? x.result ?? x.mean }))
      .filter(x => x.name);
  }
  if (m && typeof m === 'object') return Object.entries(m).map(([name, value]) => ({ name, value }));
  return [];
};

// HumanTrak test type (normalised) -> our test key and how to read it.
const HUMANTRAK_TESTS = [
  { match: (n) => n.includes('singlelegstand') || n.includes('singlelegbalance'), key: 'single_leg_stand', kind: 'sides', metric: ['time', 'duration', 'hold'] },
  { match: (n) => n.includes('trunkrotation'), key: 'trunk_rotation', kind: 'sides', metric: ['rotation', 'angle', 'range', 'rom'] },
  { match: (n) => n.includes('overheadsquat'), key: 'overhead_squat', kind: 'value', metric: ['composite', 'score'] }
];

const pickSide = (metrics, side, words) => {
  const hits = metrics.filter(m => {
    const n = norm(m.name);
    return n.includes(side) && words.some(w => n.includes(w)) && isNum(m.value);
  });
  return hits.length === 1 ? round1(hits[0].value) : (hits.length > 1 ? 'ambiguous' : null);
};

/**
 * HumanTrak: latest test per type -> { left, right } or { value }.
 * Ambiguous or missing metrics go to "unmatched" (with the metric names seen).
 */
const mapHumanTrak = (tests, wanted) => {
  const fills = {};
  const sources = {};
  const unmatched = [];
  for (const t of tests) {                                  // newest first
    const typeName = t.testTypeName || t.testType || t.movement || t.name || '';
    const rule = HUMANTRAK_TESTS.find(r => r.match(norm(typeName)));
    const metrics = metricList(t);
    if (!rule || !wanted.has(rule.key)) {
      unmatched.push({ device: 'HumanTrak', test: typeName || 'unknown', date: testDate(t), reason: rule ? 'not in this battery' : 'test type not recognised', metrics: metrics.map(m => m.name) });
      continue;
    }
    if (fills[rule.key]) continue;
    let fill = null;
    if (rule.kind === 'sides') {
      const left = pickSide(metrics, 'left', rule.metric);
      const right = pickSide(metrics, 'right', rule.metric);
      const ok = (v) => typeof v === 'number';
      // If either side is ambiguous, fill nothing: a half-filled test would
      // wrongly read as "one side only".
      if (left !== 'ambiguous' && right !== 'ambiguous' && (ok(left) || ok(right))) {
        fill = { ...(ok(left) ? { left } : {}), ...(ok(right) ? { right } : {}) };
      }
    } else {
      const hits = metrics.filter(m => rule.metric.some(w => norm(m.name).includes(w)) && isNum(m.value));
      if (hits.length === 1) fill = { value: round1(hits[0].value) };
    }
    if (!fill) {
      unmatched.push({ device: 'HumanTrak', test: typeName, date: testDate(t), reason: 'result fields not recognised, enter by hand', metrics: metrics.map(m => m.name) });
      continue;
    }
    fills[rule.key] = fill;
    sources[rule.key] = { device: 'HumanTrak', testId: t.testId || t.id || null, date: testDate(t), testType: typeName };
  }
  return { fills, sources, unmatched };
};

/**
 * Combine both devices for one sport's battery.
 * battery: the sport config's tests object.
 */
const mapLatestResults = ({ dynamo = [], humantrak = [] }, battery) => {
  const wanted = new Set(Object.keys(battery).filter(k => battery[k].source === 'vald'));
  const d = mapDynamo(dynamo, wanted);
  const h = mapHumanTrak(humantrak, wanted);
  const fills = { ...h.fills, ...d.fills };
  return {
    fills,
    sources: { ...h.sources, ...d.sources },
    missing: [...wanted].filter(k => !fills[k]),
    unmatched: [...h.unmatched, ...d.unmatched]
  };
};

module.exports = { mapDynamo, mapHumanTrak, mapLatestResults, DYNAMO_MOVEMENTS };

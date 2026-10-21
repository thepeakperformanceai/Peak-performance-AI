// Run: npm test   (from backend/)
// The 14 checks from peakperformance_scoring/test_scoring.py, ported one for
// one, plus exact-match checks against the Python engine's sample output and
// config file.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadConfig, pyRound, scoreFromAnchors, scoreFromVald, scoreSession } = require('./scoring');

const PY_DIR = path.join(__dirname, '..', '..', 'peakperformance_scoring');
const cfg = loadConfig();
const A = cfg.manual_anchors;
const FULL = {
  athlete: { id: 'T-1', age: 22, sex: 'M', position: 'MID' },
  timing_method: 'electronic',
  tests: {
    sprint_10m: { status: 'completed', value: 1.85 },
    sprint_30m: { status: 'completed', value: 4.30 },
    ruler_drop: { status: 'completed', value: 11.0 },
    cod_505: { status: 'completed', left: 2.62, right: 2.59 },
    single_leg_stand: { status: 'completed', left: 20, right: 22, cutoffs: [3, 8, 15, 25] },
    trunk_rotation: { status: 'completed', left: 45, right: 47, cutoffs: [20, 30, 40, 55] },
    overhead_squat: { status: 'completed', value: 70, cutoffs: [30, 50, 65, 80] },
    hip_extension: { status: 'completed', left: 400, right: 390, cutoffs: [150, 250, 350, 500] },
    knee_extension: { status: 'completed', left: 500, right: 480, cutoffs: [200, 300, 450, 600] }
  }
};

const copy = (s) => structuredClone(s);
const close = (a, b, tol = 0.15) => Math.abs(a - b) <= tol;
const findTest = (out, name) => out.tests.find(t => t.name === name);

// ---------- the 14 spec checks ----------

test('anchor points exact', () => {
  assert.ok(close(scoreFromAnchors(4.30, A.sprint_30m), 70));
  assert.ok(close(scoreFromAnchors(11.0, A.ruler_drop), 85));
  assert.ok(close(scoreFromAnchors(2.59, A.cod_505), 70));
});

test('anchor interpolation and limits', () => {
  assert.ok(close(scoreFromAnchors(4.20, A.sprint_30m), 77.5));
  assert.equal(scoreFromAnchors(3.50, A.sprint_30m), 99);
  assert.equal(scoreFromAnchors(9.00, A.sprint_30m), 25);
});

test('hand timing correction', () => {
  const s = copy(FULL);
  s.timing_method = 'hand';
  s.tests.sprint_30m.value = 4.08;
  assert.ok(close(findTest(scoreSession(s, cfg), 'sprint_30m').score, 70));
});

test('vald shiraz jump', () => {
  const c = [14.4, 23.1, 35.7, 49.3];
  assert.ok(close(scoreFromVald(37.2, c, cfg), 71.7));
  assert.ok(close(scoreFromVald(35.7, c, cfg), 70));
  assert.ok(close(scoreFromVald(23.1, c, cfg), 55));
});

test('vald label only is midpoint and partial', () => {
  const s = copy(FULL);
  s.tests.overhead_squat = { status: 'completed', value: 70, band: 'within_normal' };
  const t = findTest(scoreSession(s, cfg), 'overhead_squat');
  assert.ok(t.score === 63 && t.partial);
});

test('full session not provisional, endurance excluded (no endurance test in the battery)', () => {
  const out = scoreSession(FULL, cfg);
  assert.notEqual(out.ovr.value, null);
  assert.ok(!out.ovr.provisional);
  assert.equal(out.stats.endurance.status, 'not_in_battery');
  assert.equal(out.stats.endurance.value, null);
  assert.equal(cfg.tests.beep_test, undefined);
});

test('missing 5-0-5 injured', () => {
  const s = copy(FULL);
  s.tests.cod_505 = { status: 'injured' };
  const out = scoreSession(s, cfg);
  assert.equal(out.stats.agility.status, 'not_tested');
  assert.ok(out.ovr.provisional);
  assert.ok(out.ovr.reasons.includes('cod_505: injured'));
});

test('5-0-5: both feet kept, the fastest scored on cricket\'s interim scale', () => {
  assert.deepEqual(A.cod_505, require('./cricket_v1.json').manual_anchors.cod_505);
  assert.deepEqual(cfg.tests.cod_505.citation, { basis: 'interim', borrowed_from: 'cricket' });
  const t = findTest(scoreSession(FULL, cfg), 'cod_505');
  assert.deepEqual([t.raw_left, t.raw_right, t.raw], [2.62, 2.59, 2.59]);
  assert.ok(close(t.score, 70));
  const s = copy(FULL);
  s.tests.cod_505 = { status: 'completed', right: 2.46 };                    // one foot only
  assert.ok(close(findTest(scoreSession(s, cfg), 'cod_505').score, 85));
  s.tests.cod_505 = { status: 'completed', left: 2.5, right: 9.9 };          // implausible side
  assert.equal(findTest(scoreSession(s, cfg), 'cod_505').status, 'invalid');
  s.tests.cod_505 = { status: 'completed', value: 2.5 };                     // no feet entered
  assert.equal(findTest(scoreSession(s, cfg), 'cod_505').status, 'invalid');
});

test('one test missing in speed is partial', () => {
  const s = copy(FULL);
  s.tests.sprint_10m = { status: 'not_done' };
  const out = scoreSession(s, cfg);
  assert.ok(out.stats.speed.partial);
  assert.equal(out.stats.speed.value, 70);
});

test('power cap on red LSI', () => {
  const s = copy(FULL);
  s.tests.knee_extension = { status: 'completed', left: 640, right: 500, cutoffs: [200, 300, 450, 600] };
  s.tests.hip_extension = { status: 'completed', left: 560, right: 540, cutoffs: [150, 250, 350, 500] };
  const out = scoreSession(s, cfg);
  assert.ok(out.stats.power.value === 75 && out.stats.power.capped);
  assert.ok(out.flags.some(f => f.type === 'LSI' && f.level === 'red'));
});

test('OVR pending when too few stats', () => {
  const s = {
    athlete: { age: 20, sex: 'M' },
    tests: {
      ruler_drop: { status: 'completed', value: 15 },
      single_leg_stand: { status: 'completed', left: 20, right: 20, cutoffs: [3, 8, 15, 25] }
    }
  };
  const out = scoreSession(s, cfg);
  assert.ok(out.ovr.value === null && out.ovr.status === 'pending');
});

test('implausible value is invalid', () => {
  const s = copy(FULL);
  s.tests.sprint_30m.value = 2.1;
  const t = findTest(scoreSession(s, cfg), 'sprint_30m');
  assert.ok(t.status === 'invalid' && t.score === null);
});

test('female and youth provisional', () => {
  let s = copy(FULL);
  s.athlete.sex = 'F';
  assert.ok(scoreSession(s, cfg).ovr.provisional);
  s = copy(FULL);
  s.athlete.age = 16;
  assert.ok(scoreSession(s, cfg).ovr.provisional);
});

test('one side only flag', () => {
  const s = copy(FULL);
  s.tests.hip_extension = { status: 'completed', left: 400, cutoffs: [150, 250, 350, 500] };
  assert.ok(scoreSession(s, cfg).flags.some(f => f.type === 'one_side_only'));
});

test('deterministic', () => {
  assert.deepStrictEqual(scoreSession(FULL, cfg), scoreSession(FULL, cfg));
});

// ---------- parity with the Python engine's files ----------

test('sample_session.json gives exactly sample_output.json', () => {
  const session = JSON.parse(fs.readFileSync(path.join(PY_DIR, 'sample_session.json'), 'utf8'));
  const expected = JSON.parse(fs.readFileSync(path.join(PY_DIR, 'sample_output.json'), 'utf8'));
  const actual = scoreSession(session, cfg);
  assert.deepStrictEqual(actual, expected);
  // Same key order too, so the payload Gemini sees is byte-for-byte the same.
  assert.equal(JSON.stringify(actual), JSON.stringify(expected));
});

test('backend config is identical to the Python engine config', () => {
  const pyCfg = JSON.parse(fs.readFileSync(path.join(PY_DIR, 'football_v1.json'), 'utf8'));
  assert.deepStrictEqual(cfg, pyCfg);
});

test('pyRound matches Python round() on ties and float edge cases', () => {
  // Expected values are what CPython 3 returns.
  assert.equal(pyRound(0.5), 0);
  assert.equal(pyRound(1.5), 2);
  assert.equal(pyRound(2.5), 2);
  assert.equal(pyRound(72.5), 72);
  assert.equal(pyRound(73.5), 74);
  assert.equal(pyRound(0.25, 1), 0.2);
  assert.equal(pyRound(0.35, 1), 0.3);   // 0.35 is stored just below .35
  assert.equal(pyRound(2.675, 2), 2.67);
  assert.equal(pyRound(59.45, 1), 59.5); // 59.45 is stored just above .45
  assert.equal(pyRound(-1.5), -2);
});

// ---------- VALD's own percentile; measured, not rated ----------

test("VALD percentile -> card score through vald_percentile_anchors (not the same number)", () => {
  const s = scoreSession({ ...FULL, tests: { ...FULL.tests, hip_extension: { status: 'completed', left: 400, right: 390, percentile_left: 22, percentile_right: 46 } } });
  const t = s.tests.find(x => x.name === 'hip_extension');
  assert.deepEqual(cfg.vald_percentile_anchors, [[0, 25], [100, 99]]);
  assert.equal(t.score, 50.2);                     // (41.28 + 59.04) / 2
  assert.deepEqual(t.percentiles, [22, 46]);
  assert.equal(t.partial, false);                  // exact, unlike a band-only score
  assert.deepEqual(t.bands, [null, null]);
});

test('no cut-offs, percentile or band: measured, not rated (no score, no range check, no flags)', () => {
  const s = scoreSession({ ...FULL, tests: { ...FULL.tests, trunk_rotation: { status: 'completed', left: 84, right: 124 } } });
  const t = s.tests.find(x => x.name === 'trunk_rotation');
  assert.equal(t.status, 'completed');
  assert.equal(t.benchmark, 'not_rated');
  assert.equal(t.score, null);
  assert.equal(t.raw_right, 124);                   // above the 0-90 range, still shown
  assert.ok(!s.flags.some(f => f.test === 'trunk_rotation'));
  assert.ok(!s.ovr.reasons.some(r => r.startsWith('trunk_rotation')));   // flag-only test: OVR unaffected
});

test('a not-rated test that feeds a stat leaves the stat "benchmark pending", never estimated', () => {
  const s = scoreSession({ ...FULL, tests: { ...FULL.tests, hip_extension: { status: 'completed', left: 400, right: 390 }, knee_extension: { status: 'not_done' } } });
  assert.deepEqual(s.stats.power, { value: null, status: 'benchmark_pending' });
  assert.ok(s.ovr.reasons.includes('hip_extension: not_rated'));
});

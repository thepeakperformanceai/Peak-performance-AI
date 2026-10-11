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
    beep_test: { status: 'completed', level: 10, shuttle: 0 },
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
  assert.ok(close(scoreFromAnchors(10.0, A.beep_test), 55));
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

test('full session not provisional, agility excluded', () => {
  const out = scoreSession(FULL, cfg);
  assert.notEqual(out.ovr.value, null);
  assert.ok(!out.ovr.provisional);
  assert.equal(out.stats.agility.status, 'not_in_battery');
});

test('missing beep injured', () => {
  const s = copy(FULL);
  s.tests.beep_test = { status: 'injured' };
  const out = scoreSession(s, cfg);
  assert.equal(out.stats.endurance.status, 'not_tested');
  assert.ok(out.ovr.provisional);
  assert.ok(out.ovr.reasons.includes('beep_test: injured'));
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

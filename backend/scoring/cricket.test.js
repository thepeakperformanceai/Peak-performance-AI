// Run: npm test   (from backend/)
// Cricket scoring (cricket_v1): the football spec checks mirrored for
// cricket's battery, plus cricket's rules (benchmark-pending test,
// bowling-arm flags). cricket-v1.2: no endurance test (Yo-Yo IR1 removed).

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig, scoreFromAnchors, scoreFromVald, scoreSession } = require('./scoring');

const cfg = loadConfig('cricket');
const A = cfg.manual_anchors;
const FULL = {
  athlete: { id: 'C-1', age: 24, sex: 'M', position: 'PACE', dominant_hand: 'R' },
  timing_method: 'electronic',
  tests: {
    sprint_10m: { status: 'completed', value: 1.84 },
    sprint_20m: { status: 'completed', value: 3.13 },
    cod_505: { status: 'completed', value: 2.46 },
    medicine_ball: { status: 'completed', value: 7.4 },
    ruler_drop: { status: 'completed', value: 11.0 },
    single_leg_stand: { status: 'completed', left: 20, right: 22, cutoffs: [3, 8, 15, 25] },
    shoulder_er: { status: 'completed', left: 150, right: 145, cutoffs: [60, 100, 150, 220] },
    shoulder_ir: { status: 'completed', left: 200, right: 205, cutoffs: [80, 140, 200, 280] },
    elbow_extension: { status: 'completed', left: 180, right: 184, cutoffs: [70, 120, 170, 240] },
    hip_extension: { status: 'completed', left: 400, right: 390, cutoffs: [150, 250, 350, 500] }
  }
};

const copy = (s) => structuredClone(s);
const close = (a, b, tol = 0.15) => Math.abs(a - b) <= tol;
const findTest = (out, name) => out.tests.find(t => t.name === name);

// ---------- config ----------

test('cricket config: battery, weights, cited anchors', () => {
  assert.equal(cfg.config_version, 'cricket-v1.2');
  assert.deepEqual(Object.keys(cfg.tests), ['sprint_10m', 'sprint_20m', 'cod_505', 'medicine_ball',
    'ruler_drop', 'single_leg_stand', 'shoulder_er', 'shoulder_ir', 'elbow_extension', 'hip_extension']);
  assert.deepEqual(cfg.stat_weights, { speed: 20, agility: 20, power: 20, endurance: 15, reaction: 15, balance: 10 });
  assert.equal(Object.values(cfg.stat_weights).reduce((a, b) => a + b, 0), 100);
  assert.deepEqual(A.ruler_drop, loadConfig('football').manual_anchors.ruler_drop);
  assert.ok(cfg.tests.medicine_ball.benchmark_pending);
  assert.equal(cfg.tests.cod_505.benchmark_pending, undefined);
  assert.deepEqual(A.cod_505, [[2.86, 40], [2.72, 55], [2.59, 70], [2.46, 85], [2.30, 95]]);
  assert.equal(A.medicine_ball, undefined);
  assert.deepEqual(cfg.stats_not_in_battery, ['endurance']);
  assert.equal(cfg.tests.yoyo_ir1, undefined);
  assert.equal(A.yoyo_ir1, undefined);
  for (const k of ['sprint_10m', 'sprint_20m', 'ruler_drop', 'cod_505', 'medicine_ball', 'arm_ratio']) {
    assert.ok(cfg.sources[k], `source for ${k}`);
  }
  // Power: medicine ball half, the four Dynamo tests share the other half.
  const power = Object.entries(cfg.tests).filter(([, d]) => d.stat === 'power');
  assert.equal(power.reduce((a, [, d]) => a + d.stat_weight, 0), 1);
});

// ---------- the football spec checks, for cricket ----------

test('anchor points exact (international means score 85)', () => {
  assert.ok(close(scoreFromAnchors(1.84, A.sprint_10m), 85));
  assert.ok(close(scoreFromAnchors(3.13, A.sprint_20m), 85));
  assert.ok(close(scoreFromAnchors(2.96, A.sprint_20m), 95));
  assert.ok(close(scoreFromAnchors(11.0, A.ruler_drop), 85));
  assert.ok(close(scoreFromAnchors(2.46, A.cod_505), 85));      // male cricketer mean, Thomas et al. 2018
  assert.ok(close(scoreFromAnchors(2.30, A.cod_505), 95));      // Draper & Lancaster elite cut-off
});

test('anchor interpolation and limits', () => {
  assert.ok(close(scoreFromAnchors(3.19, A.sprint_20m), 77.5));  // halfway 3.25 -> 3.13
  assert.ok(close(scoreFromAnchors(2.655, A.cod_505), 62.5));    // halfway 2.72 -> 2.59
  assert.equal(scoreFromAnchors(1.50, A.sprint_10m), 99);         // capped
  assert.equal(scoreFromAnchors(4.50, A.sprint_20m), 25);         // floored
});

test('hand timing correction on both sprints', () => {
  const s = copy(FULL);
  s.timing_method = 'hand';
  s.tests.sprint_20m.value = 2.91;                                // +0.22 = 3.13 -> 85
  s.tests.sprint_10m.value = 1.62;                                // +0.22 = 1.84 -> 85
  const out = scoreSession(s, cfg);
  assert.ok(close(findTest(out, 'sprint_20m').score, 85));
  assert.ok(close(findTest(out, 'sprint_10m').score, 85));
  assert.equal(findTest(out, 'sprint_20m').timing, 'hand');
});

test('vald band scoring', () => {
  assert.ok(close(scoreFromVald(37.2, [14.4, 23.1, 35.7, 49.3], cfg), 71.7));
});

test('vald label only is midpoint and partial', () => {
  const s = copy(FULL);
  s.tests.single_leg_stand = { status: 'completed', left: 20, right: 22, band: 'within_normal' };
  const t = findTest(scoreSession(s, cfg), 'single_leg_stand');
  assert.ok(t.score === 63 && t.partial);
});

test('full session: 505 scored; pending medicine ball kept raw, not scored, OVR provisional', () => {
  const out = scoreSession(FULL, cfg);
  const agility = findTest(out, 'cod_505');
  assert.deepEqual([agility.status, agility.score, agility.raw, agility.benchmark], ['completed', 85, 2.46, 'research']);
  assert.equal(agility.timing, undefined);                        // no hand-timing correction for the 505
  const mb = findTest(out, 'medicine_ball');
  assert.deepEqual([mb.score, mb.raw, mb.benchmark], [null, 7.4, 'pending']);
  assert.deepEqual(out.stats.agility, { value: 85, partial: false });
  assert.ok(out.stats.power.partial);                             // Dynamo only for now
  assert.deepEqual(
    Object.fromEntries(Object.entries(out.stats).map(([k, v]) => [k, v.value])),
    { speed: 85, agility: 85, power: 72, endurance: null, reaction: 85, balance: 79 });
  assert.equal(out.stats.endurance.status, 'not_in_battery');
  // (20*85 + 20*85 + 20*71.7 + 15*85 + 10*79) / 85 = 81.2 -> 81 (endurance's 15% left out)
  assert.equal(out.ovr.value, 81);
  assert.equal(out.ovr.provisional, true);
  assert.deepEqual(out.ovr.reasons, ['medicine_ball: benchmark_pending']);
});

test('missing 505 injured', () => {
  const s = copy(FULL);
  s.tests.cod_505 = { status: 'injured' };
  const out = scoreSession(s, cfg);
  assert.equal(out.stats.agility.status, 'not_tested');
  assert.ok(out.ovr.reasons.includes('cod_505: injured'));
});

test('one sprint missing makes speed partial', () => {
  const s = copy(FULL);
  s.tests.sprint_10m = { status: 'not_done' };
  const out = scoreSession(s, cfg);
  assert.ok(out.stats.speed.partial);
  assert.equal(out.stats.speed.value, 85);
});

test('power cap on red LSI (hip extension)', () => {
  const s = copy(FULL);
  s.tests.hip_extension = { status: 'completed', left: 560, right: 420, cutoffs: [150, 250, 350, 500] }; // LSI 75%
  for (const n of ['shoulder_er', 'shoulder_ir', 'elbow_extension']) {
    s.tests[n] = { ...s.tests[n], left: 300, right: 300 };
  }
  const out = scoreSession(s, cfg);
  assert.ok(out.flags.some(f => f.type === 'LSI' && f.test === 'hip_extension' && f.level === 'red'));
  assert.ok(out.stats.power.value === 75 && out.stats.power.capped);
});

test('OVR pending when too few stats', () => {
  const s = { athlete: { age: 20, sex: 'M', dominant_hand: 'R' }, tests: {
    ruler_drop: { status: 'completed', value: 15 },
    single_leg_stand: { status: 'completed', left: 20, right: 20, cutoffs: [3, 8, 15, 25] },
    medicine_ball: { status: 'completed', value: 7.0 }
  } };
  const out = scoreSession(s, cfg);
  assert.ok(out.ovr.value === null && out.ovr.status === 'pending');
});

test('implausible value is invalid, including pending tests', () => {
  const s = copy(FULL);
  s.tests.sprint_20m.value = 1.9;
  s.tests.medicine_ball.value = 20;
  const out = scoreSession(s, cfg);
  assert.equal(findTest(out, 'sprint_20m').status, 'invalid');
  assert.equal(findTest(out, 'medicine_ball').status, 'invalid');
});

test('female and youth provisional', () => {
  let s = copy(FULL);
  s.athlete.sex = 'F';
  assert.ok(scoreSession(s, cfg).ovr.reasons.includes('benchmarks are adult male only'));
  s = copy(FULL);
  s.athlete.age = 16;
  assert.ok(scoreSession(s, cfg).ovr.reasons.includes('benchmarks are adult only'));
});

test('one side only flag', () => {
  const s = copy(FULL);
  s.tests.elbow_extension = { status: 'completed', left: 180, cutoffs: [70, 120, 170, 240] };
  assert.ok(scoreSession(s, cfg).flags.some(f => f.type === 'one_side_only' && f.test === 'elbow_extension'));
});

test('deterministic', () => {
  assert.deepStrictEqual(scoreSession(FULL, cfg), scoreSession(FULL, cfg));
});

// ---------- cricket rules ----------

test('shoulder balance: bowling-arm ER below 66% of IR is amber', () => {
  const s = copy(FULL);                                            // bowling arm R
  s.tests.shoulder_er = { status: 'completed', left: 150, right: 120, cutoffs: [60, 100, 150, 220] };
  s.tests.shoulder_ir = { status: 'completed', left: 200, right: 200, cutoffs: [80, 140, 200, 280] };
  const flag = scoreSession(s, cfg).flags.find(f => f.type === 'shoulder_balance');
  assert.deepEqual(flag, { type: 'shoulder_balance', test: 'shoulder_er', value: 60, level: 'amber' }); // 120/200
});

test('shoulder balance: uses the bowling arm only; exactly 66% not flagged', () => {
  let s = copy(FULL);
  s.athlete.dominant_hand = 'L';                                  // L: 150/200 = 75%, fine
  s.tests.shoulder_er = { status: 'completed', left: 150, right: 120, cutoffs: [60, 100, 150, 220] };
  s.tests.shoulder_ir = { status: 'completed', left: 200, right: 200, cutoffs: [80, 140, 200, 280] };
  assert.equal(scoreSession(s, cfg).flags.some(f => f.type === 'shoulder_balance'), false);
  s = copy(FULL);
  s.tests.shoulder_er = { status: 'completed', left: 150, right: 132, cutoffs: [60, 100, 150, 220] };
  s.tests.shoulder_ir = { status: 'completed', left: 200, right: 200, cutoffs: [80, 140, 200, 280] };
  assert.equal(scoreSession(s, cfg).flags.some(f => f.type === 'shoulder_balance'), false);
});

test('bowling arm weaker (shoulder IR / elbow) is "monitor", never red, no power cap', () => {
  const s = copy(FULL);                                            // bowling arm R
  s.tests.elbow_extension = { status: 'completed', left: 260, right: 190, cutoffs: [70, 120, 170, 240] }; // R weaker, LSI 73.1
  const out = scoreSession(s, cfg);
  const f = out.flags.find(x => x.test === 'elbow_extension' && x.type === 'LSI');
  assert.deepEqual(f, { type: 'LSI', test: 'elbow_extension', value: 73.1, level: 'monitor', dominant_side_weaker: true });
  assert.equal(out.stats.power.capped, undefined);
});

test('non-bowling arm weaker gets the usual red LSI', () => {
  const s = copy(FULL);
  s.athlete.dominant_hand = 'L';
  s.tests.elbow_extension = { status: 'completed', left: 260, right: 190, cutoffs: [70, 120, 170, 240] };
  assert.ok(scoreSession(s, cfg).flags.some(f => f.test === 'elbow_extension' && f.level === 'red'));
});

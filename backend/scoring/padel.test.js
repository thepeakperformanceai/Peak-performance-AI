// Run: npm test   (from backend/)
// Padel scoring (padel_v1): the football spec checks mirrored for padel's
// battery, plus padel's own rules (weights, groin ratio, dominant arm).
// padel-v1.1: Beep Test removed; 5-0-5 timed off each foot, the fastest scored.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig, scoreFromAnchors, scoreFromVald, scoreSession } = require('./scoring');

const cfg = loadConfig('padel');
const A = cfg.manual_anchors;
const FULL = {
  athlete: { id: 'P-1', age: 24, sex: 'M', position: 'LEFT', dominant_hand: 'R' },
  timing_method: 'electronic',
  tests: {
    sprint_10m: { status: 'completed', value: 1.97 },
    ruler_drop: { status: 'completed', value: 11.0 },
    cod_505: { status: 'completed', left: 2.62, right: 2.59 },
    single_leg_stand: { status: 'completed', left: 20, right: 22, cutoffs: [3, 8, 15, 25] },
    trunk_rotation: { status: 'completed', left: 45, right: 47, cutoffs: [20, 30, 40, 55] },
    overhead_squat: { status: 'completed', value: 70, cutoffs: [30, 50, 65, 80] },
    shoulder_er: { status: 'completed', left: 180, right: 176, cutoffs: [60, 100, 150, 220] },
    hip_abduction: { status: 'completed', left: 300, right: 296, cutoffs: [100, 180, 260, 340] },
    hip_adduction: { status: 'completed', left: 280, right: 276, cutoffs: [100, 180, 260, 340] }
  }
};

const copy = (s) => structuredClone(s);
const close = (a, b, tol = 0.15) => Math.abs(a - b) <= tol;
const findTest = (out, name) => out.tests.find(t => t.name === name);

// ---------- config ----------

test('padel config: battery, weights and interim anchors as specified', () => {
  assert.equal(cfg.config_version, 'padel-v1.1');
  assert.deepEqual(Object.keys(cfg.tests), ['sprint_10m', 'ruler_drop', 'cod_505', 'single_leg_stand',
    'trunk_rotation', 'overhead_squat', 'shoulder_er', 'hip_abduction', 'hip_adduction']);
  assert.deepEqual(cfg.stat_weights, { reaction: 20, speed: 20, agility: 25, power: 15, balance: 10, endurance: 10 });
  assert.equal(Object.values(cfg.stat_weights).reduce((a, b) => a + b, 0), 100);
  assert.deepEqual(A.sprint_10m, [[2.25, 40], [2.10, 55], [1.97, 70], [1.85, 85], [1.78, 95]]);
  assert.deepEqual(A.ruler_drop, loadConfig('football').manual_anchors.ruler_drop);
  // 5-0-5: cricket's anchors, an interim benchmark until padel norms are agreed; both feet timed.
  assert.deepEqual(A.cod_505, loadConfig('cricket').manual_anchors.cod_505);
  assert.deepEqual(cfg.tests.cod_505.citation, { basis: 'interim', borrowed_from: 'cricket' });
  assert.equal(cfg.tests.cod_505.best_of_left_right, true);
  assert.equal(cfg.tests.cod_505.stat, 'agility');
  assert.equal(A.beep_test, undefined);
  assert.equal(cfg.tests.beep_test, undefined);
  assert.deepEqual(cfg.stats_not_in_battery, ['endurance']);
  assert.equal(cfg.tests.trunk_rotation.stat, null);
  assert.equal(cfg.tests.overhead_squat.stat, null);
  for (const n of ['shoulder_er', 'hip_abduction', 'hip_adduction']) {
    assert.equal(cfg.tests[n].stat, 'power');
    assert.ok(cfg.tests[n].dynamo && cfg.tests[n].bilateral);
  }
  assert.match(cfg.notes, /approximate/i);
});

// ---------- the football spec checks, for padel ----------

test('anchor points exact', () => {
  assert.ok(close(scoreFromAnchors(1.97, A.sprint_10m), 70));
  assert.ok(close(scoreFromAnchors(2.25, A.sprint_10m), 40));
  assert.ok(close(scoreFromAnchors(11.0, A.ruler_drop), 85));
  assert.ok(close(scoreFromAnchors(2.59, A.cod_505), 70));
  assert.ok(close(scoreFromAnchors(2.30, A.cod_505), 95));
});

test('anchor interpolation and limits', () => {
  assert.ok(close(scoreFromAnchors(2.035, A.sprint_10m), 62.5));  // halfway 2.10 -> 1.97
  assert.ok(close(scoreFromAnchors(2.655, A.cod_505), 62.5));     // halfway 2.72 -> 2.59
  assert.equal(scoreFromAnchors(1.60, A.sprint_10m), 99);          // capped
  assert.equal(scoreFromAnchors(3.20, A.sprint_10m), 25);          // floored
});

test('hand timing correction', () => {
  const s = copy(FULL);
  s.timing_method = 'hand';
  s.tests.sprint_10m.value = 1.75;                                  // +0.22 = 1.97 -> 70
  const t = findTest(scoreSession(s, cfg), 'sprint_10m');
  assert.ok(close(t.score, 70));
  assert.equal(t.timing, 'hand');
});

test('vald band scoring', () => {
  const c = [14.4, 23.1, 35.7, 49.3];
  assert.ok(close(scoreFromVald(37.2, c, cfg), 71.7));
  assert.ok(close(scoreFromVald(35.7, c, cfg), 70));
});

test('vald label only is midpoint and partial', () => {
  const s = copy(FULL);
  s.tests.overhead_squat = { status: 'completed', value: 70, band: 'within_normal' };
  const t = findTest(scoreSession(s, cfg), 'overhead_squat');
  assert.ok(t.score === 63 && t.partial);
});

test('full session not provisional, endurance excluded, weighted OVR', () => {
  const out = scoreSession(FULL, cfg);
  assert.deepEqual(
    Object.fromEntries(Object.entries(out.stats).map(([k, v]) => [k, v.value])),
    { reaction: 85, speed: 70, agility: 70, power: 76, balance: 79, endurance: null });
  assert.equal(out.stats.endurance.status, 'not_in_battery');
  // (20*85 + 20*70 + 25*70 + 15*75.5 + 10*79) / 90 = 75.25 -> 75 (endurance's 10% left out)
  assert.equal(out.ovr.value, 75);
  assert.equal(out.ovr.provisional, false);
  assert.deepEqual(out.flags, []);
  assert.equal(out.config_version, 'padel-v1.1');
});

test('missing 5-0-5 injured', () => {
  const s = copy(FULL);
  s.tests.cod_505 = { status: 'injured' };
  const out = scoreSession(s, cfg);
  assert.equal(out.stats.agility.status, 'not_tested');
  assert.ok(out.ovr.provisional);
  assert.ok(out.ovr.reasons.includes('cod_505: injured'));
});

test('one test missing in power is partial (mean of the other two)', () => {
  const s = copy(FULL);
  s.tests.shoulder_er = { status: 'not_done' };
  const out = scoreSession(s, cfg);
  assert.ok(out.stats.power.partial);
  assert.equal(out.stats.power.value, 75);                         // (77.1 + 73.4) / 2 = 75.25
});

test('power cap on red LSI (hip abduction)', () => {
  const s = copy(FULL);
  s.tests.hip_abduction = { status: 'completed', left: 420, right: 320, cutoffs: [100, 180, 260, 340] }; // LSI 76.2%
  s.tests.shoulder_er = { status: 'completed', left: 260, right: 255, cutoffs: [60, 100, 150, 220] };
  const out = scoreSession(s, cfg);
  assert.ok(out.flags.some(f => f.type === 'LSI' && f.test === 'hip_abduction' && f.level === 'red'));
  assert.ok(out.stats.power.value === 75 && out.stats.power.capped);
});

test('OVR pending when too few stats', () => {
  const s = { athlete: { age: 20, sex: 'M', dominant_hand: 'R' }, tests: {
    ruler_drop: { status: 'completed', value: 15 },
    single_leg_stand: { status: 'completed', left: 20, right: 20, cutoffs: [3, 8, 15, 25] }
  } };
  const out = scoreSession(s, cfg);
  assert.ok(out.ovr.value === null && out.ovr.status === 'pending');
});

test('implausible value is invalid', () => {
  const s = copy(FULL);
  s.tests.sprint_10m.value = 4.0;
  const t = findTest(scoreSession(s, cfg), 'sprint_10m');
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
  s.tests.hip_adduction = { status: 'completed', left: 280, cutoffs: [100, 180, 260, 340] };
  assert.ok(scoreSession(s, cfg).flags.some(f => f.type === 'one_side_only' && f.test === 'hip_adduction'));
});

test('deterministic', () => {
  assert.deepStrictEqual(scoreSession(FULL, cfg), scoreSession(FULL, cfg));
});

// ---------- padel rules ----------

test('groin risk: adduction below 80% of abduction (mean of both sides) is amber', () => {
  const s = copy(FULL);
  s.tests.hip_adduction = { status: 'completed', left: 200, right: 210, cutoffs: [100, 180, 260, 340] };
  s.tests.hip_abduction = { status: 'completed', left: 300, right: 300, cutoffs: [100, 180, 260, 340] };
  const flag = scoreSession(s, cfg).flags.find(f => f.type === 'groin_risk');
  assert.deepEqual(flag, { type: 'groin_risk', test: 'hip_adduction', value: 68.3, level: 'amber' }); // 205 / 300
});

test('groin risk: exactly 80% is not flagged', () => {
  const s = copy(FULL);
  s.tests.hip_adduction = { status: 'completed', left: 240, right: 240, cutoffs: [100, 180, 260, 340] };
  s.tests.hip_abduction = { status: 'completed', left: 300, right: 300, cutoffs: [100, 180, 260, 340] };
  assert.equal(scoreSession(s, cfg).flags.some(f => f.type === 'groin_risk'), false);
});

test('groin risk: uses the sides entered; skipped if either test missing', () => {
  let s = copy(FULL);
  s.tests.hip_adduction = { status: 'completed', left: 220, cutoffs: [100, 180, 260, 340] };
  s.tests.hip_abduction = { status: 'completed', left: 300, right: 300, cutoffs: [100, 180, 260, 340] };
  assert.equal(scoreSession(s, cfg).flags.find(f => f.type === 'groin_risk').value, 73.3);
  s = copy(FULL);
  s.tests.hip_abduction = { status: 'injured' };
  s.tests.hip_adduction = { status: 'completed', left: 100, right: 100, cutoffs: [100, 180, 260, 340] };
  assert.equal(scoreSession(s, cfg).flags.some(f => f.type === 'groin_risk'), false);
});

test('shoulder ER: dominant arm weaker is "monitor", never red, no power cap', () => {
  const s = copy(FULL);                                             // dominant hand R
  s.tests.shoulder_er = { status: 'completed', left: 260, right: 190, cutoffs: [60, 100, 150, 220] }; // LSI 73.1%, R weaker
  s.tests.hip_abduction = { status: 'completed', left: 420, right: 410, cutoffs: [100, 180, 260, 340] };
  s.tests.hip_adduction = { status: 'completed', left: 410, right: 400, cutoffs: [100, 180, 260, 340] };
  const out = scoreSession(s, cfg);
  const lsi = out.flags.filter(f => f.type === 'LSI');
  assert.deepEqual(lsi, [{ type: 'LSI', test: 'shoulder_er', value: 73.1, level: 'monitor', dominant_side_weaker: true }]);
  assert.ok(out.stats.power.value > 75 && !out.stats.power.capped);
});

test('shoulder ER: non-dominant arm weaker gets the usual LSI flags and power cap', () => {
  const s = copy(FULL);
  s.athlete.dominant_hand = 'L';                                    // now the weaker R arm is non-dominant
  s.tests.shoulder_er = { status: 'completed', left: 260, right: 190, cutoffs: [60, 100, 150, 220] };
  s.tests.hip_abduction = { status: 'completed', left: 420, right: 410, cutoffs: [100, 180, 260, 340] };
  s.tests.hip_adduction = { status: 'completed', left: 410, right: 400, cutoffs: [100, 180, 260, 340] };
  const out = scoreSession(s, cfg);
  assert.ok(out.flags.some(f => f.type === 'LSI' && f.test === 'shoulder_er' && f.level === 'red'));
  assert.ok(out.stats.power.value === 75 && out.stats.power.capped);
});

test('shoulder ER: dominant arm weaker but within 90% gives no flag', () => {
  const s = copy(FULL);
  s.tests.shoulder_er = { status: 'completed', left: 200, right: 190, cutoffs: [60, 100, 150, 220] }; // LSI 95%
  assert.equal(scoreSession(s, cfg).flags.some(f => f.test === 'shoulder_er'), false);
});

// Run: npm test   (from backend/)
// Cricket report pipeline: input checks, Gemini payload and rules, the
// "no invented numbers" check and the card. Gemini is faked here.

const test = require('node:test');
const assert = require('node:assert/strict');
const { forSport, findUnsupportedNumbers } = require('./scoredReport.service');
const { scoreSession } = require('../scoring/scoring');

const cricket = forSport('cricket');

const PROFILE = {
  name: 'Bilal Akhtar', dob: '2001-04-09', testDate: '2026-10-12', sex: 'M', position: 'PACE',
  dominantHand: 'R', bodyweight: '78.0', trainingLevel: 'Elite', athleteId: 'PP-0301'
};
const RESULTS = {
  timingMethod: 'electronic',
  tests: {
    sprint_10m: { status: 'completed', value: '1.88' },
    sprint_20m: { status: 'completed', value: '3.19' },
    agility_505: { status: 'completed', value: '4.62' },
    medicine_ball: { status: 'completed', value: '7.4' },
    yoyo_ir1: { status: 'completed', level: '17', shuttle: '4' },
    ruler_drop: { status: 'completed', value: '13.0' },
    single_leg_stand: { status: 'completed', left: '19', right: '23', cutoffs: ['3', '8', '15', '25'] },
    shoulder_er: { status: 'completed', left: '150', right: '118', cutoffs: ['60', '100', '150', '220'] },
    shoulder_ir: { status: 'completed', left: '205', right: '210', cutoffs: ['80', '140', '200', '280'] },
    elbow_extension: { status: 'completed', left: '180', right: '176', cutoffs: ['70', '120', '170', '240'] },
    hip_extension: { status: 'completed', left: '420', right: '410', cutoffs: ['150', '250', '350', '500'] }
  }
};

const copy = (o) => structuredClone(o);

const fakeNarrative = (payload) => JSON.stringify({
  playerProfile: 'Skiddy pace bowler with quick hands in the field.',
  summary: 'A strong session. The rating will firm up after the remaining tests.',
  stats: { speed: 'Quick between the wickets.', power: 'Good strength through the chain.', agility: 'Not scored yet: benchmarks pending.',
    endurance: 'Holds intensity through long spells.', balance: 'Stable on one leg.', reaction: 'Sharp hands.' },
  symmetry: 'The bowling arm is the weaker side in external rotation, which is common in cricketers.',
  recommendation: 'External rotator strength on the bowling arm.',
  flags: payload.flags.map(() => 'Something to monitor and build on.')
});

test('form entry becomes the engine session, with bowling arm', () => {
  const { profile, session } = cricket.validateInput(PROFILE, RESULTS);
  assert.equal(profile.age, 25);
  assert.deepEqual(session.athlete, { id: 'PP-0301', age: 25, sex: 'M', position: 'PACE', dominant_hand: 'R' });
  assert.deepEqual(Object.keys(session.tests), Object.keys(cricket.cfg.tests));
  assert.deepEqual(session.tests.yoyo_ir1, { status: 'completed', level: 17, shuttle: 4 });
  assert.deepEqual(session.tests.medicine_ball, { status: 'completed', value: 7.4 });
});

test('bowling arm and role required; Yo-Yo level/shuttle checked', () => {
  assert.throws(() => cricket.validateInput({ ...PROFILE, dominantHand: '' }, RESULTS), /Bowling arm is required/);
  assert.throws(() => cricket.validateInput({ ...PROFILE, position: 'FWD' }, RESULTS), /Role is required/);
  const r = copy(RESULTS);
  r.tests.yoyo_ir1 = { status: 'completed', level: '10', shuttle: '1' };
  assert.throws(() => cricket.validateInput(PROFILE, r), /Yo-Yo IR1: level must be one of 5, 9, 11/);
  r.tests.yoyo_ir1 = { status: 'completed', level: '17', shuttle: '9' };
  assert.throws(() => cricket.validateInput(PROFILE, r), /shuttle must be a whole number from 1 to 8 at level 17/);
  r.tests.yoyo_ir1 = { status: 'completed', level: '17', shuttle: '0' };
  assert.throws(() => cricket.validateInput(PROFILE, r), /from 1 to 8/);
});

test('Gemini payload: pending tests, Yo-Yo distance, cricket flags, no name', () => {
  const { session } = cricket.validateInput(PROFILE, RESULTS);
  const scored = scoreSession(session, cricket.cfg);
  const payload = cricket.buildGeminiPayload(scored, session);
  assert.equal(JSON.stringify(payload).includes('Bilal'), false);
  assert.equal(payload.config_version, 'cricket-v1.0');
  const agility = payload.tests.find(t => t.name === '5-10-5 Pro Agility');
  assert.deepEqual([agility.raw, agility.score, agility.benchmark], [4.62, null, 'pending']);
  const yoyo = payload.tests.find(t => t.name === 'Yo-Yo IR1');
  assert.deepEqual([yoyo.raw, yoyo.level, yoyo.shuttle, yoyo.distance_m], ['17.4', 17, 4, 1560]);
  assert.deepEqual(payload.stats.agility, { value: null, status: 'benchmark_pending' });
  assert.deepEqual(payload.ovr.reasons, ['5-10-5 Pro Agility: benchmarks pending', 'Medicine Ball Throw (seated, 4 kg): benchmarks pending']);
  // R is the bowling arm: ER 118 weaker than L 150 -> monitor; ER:IR 118/210 = 56.2% -> shoulder balance.
  assert.deepEqual(payload.flags, [
    { type: 'LSI', test: 'Shoulder External Rotation', value: 78.7, level: 'monitor', dominant_side_weaker: true },
    { type: 'shoulder_balance', test: 'Shoulder External Rotation', value: 56.2, level: 'amber' }
  ]);
});

test('cricket system prompt: shared rules plus cricket rules', () => {
  for (const rule of ['Use only numbers present in the payload', 'not tested this session', 'firm up after the remaining tests',
    'never as diagnoses', 'compared with cricketers', 'benchmark "pending"', 'never rate it, score it or compare it',
    'common in cricketers', 'shoulder_balance', 'level.shuttle']) {
    assert.ok(cricket.SYSTEM_PROMPT.includes(rule), rule);
  }
  assert.equal(cricket.SYSTEM_PROMPT.includes('padel'), false);
});

test('number check covers Yo-Yo metres and rejects invented numbers', async () => {
  const { session } = cricket.validateInput(PROFILE, RESULTS);
  const payload = cricket.buildGeminiPayload(scoreSession(session, cricket.cfg), session);
  assert.deepEqual(findUnsupportedNumbers({ a: 'Yo-Yo 17.4 (1560 m), medicine ball 7.4 m' }, payload), []);
  assert.deepEqual(findUnsupportedNumbers({ a: 'Agility would score about 66.6' }, payload), [66.6]);
  let calls = 0;
  const callModel = async () => {
    calls++;
    return calls === 1 ? JSON.stringify({ ...JSON.parse(fakeNarrative(payload)), summary: 'Agility about 66.6.' }) : fakeNarrative(payload);
  };
  const { attempts } = await cricket.generateNarrative(payload, { callModel });
  assert.equal(attempts, 2);
});

test('full pipeline: cricket card content', async () => {
  const { profile, session } = cricket.validateInput(PROFILE, RESULTS);
  let prompt;
  const callModel = async (system, p) => { prompt = p; return fakeNarrative(JSON.parse(p.slice(p.indexOf('{')))); };
  const { reportContent: rc, scored } = await cricket.runPipeline(profile, session, { callModel });

  assert.match(prompt, /^Write the report text for this cricket testing session/);
  assert.equal(rc.sport, 'Cricket');
  assert.equal(rc.batteryLabel, 'Cricket Battery v1');
  assert.equal(rc.position, 'PACE');
  assert.equal(rc.dominantHand, 'R');
  assert.equal(rc.overallOVR, scored.ovr.value);
  assert.equal(rc.ovrStatus, 'provisional');
  assert.deepEqual(rc.ovrScores.find(s => s.name === 'Agility'), { name: 'Agility', score: null, status: 'benchmark_pending' });
  assert.equal(rc.fieldMeaning.stats.find(s => s.name === 'Agility').tag, 'PENDING');
  assert.deepEqual(rc.manualBattery.map(t => [t.test, t.avg]), [
    ['10m Sprint', 'vs published international norms'], ['20m Sprint', 'vs published international norms'],
    ['5-10-5 Pro Agility', 'benchmarks pending'], ['Medicine Ball Throw (seated, 4 kg)', 'benchmarks pending'],
    ['Yo-Yo IR1', 'vs published international norms'], ['Ruler Drop', 'vs published international norms']
  ]);
  assert.deepEqual(rc.dynamoStrength.map(d => [d.joint, d.status]), [
    ['Shoulder External Rotation', 'MONITOR — DOMINANT ARM'], ['Shoulder Internal Rotation', 'WITHIN RANGE'],
    ['Elbow Extension', 'WITHIN RANGE'], ['Hip Extension', 'WITHIN RANGE']
  ]);
  const yoyoRow = rc.testTable.find(r => r.test === 'Yo-Yo IR1');
  assert.equal(yoyoRow.result, '17.4 (1560 m)');
  const mbRow = rc.testTable.find(r => r.test === 'Medicine Ball Throw (seated, 4 kg)');
  assert.deepEqual([mbRow.result, mbRow.unit, mbRow.score, mbRow.benchmarkPending], ['7.4', 'm', null, true]);
  assert.equal(rc.testTable.length, 11);
  assert.deepEqual(rc.flags.map(f => [f.type, f.level]), [['LSI', 'monitor'], ['shoulder_balance', 'amber']]);
});

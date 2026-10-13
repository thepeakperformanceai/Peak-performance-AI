// Run: npm test   (from backend/)
// Padel report pipeline: input checks, Gemini payload and rules, the
// "no invented numbers" check and the card. Gemini is faked here.

const test = require('node:test');
const assert = require('node:assert/strict');
const { forSport, findUnsupportedNumbers } = require('./scoredReport.service');
const { scoreSession } = require('../scoring/scoring');

const padel = forSport('padel');

const PROFILE = {
  name: 'Sara Malik', dob: '2000-06-15', testDate: '2026-10-12', sex: 'F', position: 'LEFT',
  dominantHand: 'R', bodyweight: '61.2', trainingLevel: 'Elite', athleteId: 'PP-0201'
};
const RESULTS = {
  timingMethod: 'hand',
  tests: {
    sprint_10m: { status: 'completed', value: '1.82' },
    ruler_drop: { status: 'completed', value: '12.5' },
    beep_test: { status: 'not_done' },
    single_leg_stand: { status: 'completed', left: '21', right: '24', cutoffs: ['3', '8', '15', '25'] },
    trunk_rotation: { status: 'completed', left: '48', right: '50', cutoffs: ['20', '30', '40', '55'] },
    overhead_squat: { status: 'completed', value: '66', band: 'within_normal' },
    shoulder_er: { status: 'completed', left: '150', right: '118', cutoffs: ['50', '80', '120', '170'] },
    hip_abduction: { status: 'completed', left: '260', right: '250', cutoffs: ['90', '160', '230', '300'] },
    hip_adduction: { status: 'completed', left: '190', right: '196', cutoffs: ['90', '160', '230', '300'] }
  }
};

const copy = (o) => structuredClone(o);

const fakeNarrative = (payload) => JSON.stringify({
  playerProfile: 'Quick left-side player who reads the ball early.',
  summary: 'A solid session. The rating will firm up after the remaining tests.',
  stats: { speed: 'Quick first steps.', power: 'Good lateral strength.', agility: 'Not tested this session.',
    endurance: 'Not tested this session.', balance: 'Stable on one leg.', reaction: 'Sharp hands at the net.' },
  symmetry: 'The dominant arm is the weaker side in external rotation, which is common in racket players.',
  recommendation: 'Adductor strength work.',
  flags: payload.flags.map(() => 'Something to monitor and build on.')
});

test('form entry becomes the engine session, with dominant hand', () => {
  const { profile, session } = padel.validateInput(PROFILE, RESULTS);
  assert.equal(profile.age, 26);
  assert.equal(profile.dominantHand, 'R');
  assert.deepEqual(session.athlete, { id: 'PP-0201', age: 26, sex: 'F', position: 'LEFT', dominant_hand: 'R' });
  assert.deepEqual(Object.keys(session.tests), Object.keys(padel.cfg.tests));
  assert.deepEqual(session.tests.shoulder_er, { status: 'completed', left: 150, right: 118, cutoffs: [50, 80, 120, 170] });
  assert.deepEqual(session.tests.beep_test, { status: 'not_done' });
});

test('dominant hand and court side are required; football positions rejected', () => {
  assert.throws(() => padel.validateInput({ ...PROFILE, dominantHand: '' }, RESULTS), /Dominant hand is required/);
  assert.throws(() => padel.validateInput({ ...PROFILE, dominantHand: 'X' }, RESULTS), /Dominant hand is required/);
  assert.throws(() => padel.validateInput({ ...PROFILE, position: 'MID' }, RESULTS), /Court side is required/);
  assert.throws(() => padel.validateInput({ ...PROFILE, bodyweight: '' }, RESULTS), /Bodyweight is required/);
  assert.throws(() => padel.validateInput(PROFILE, { ...RESULTS, timingMethod: '' }), /Timing method/);
});

test('completed tests need values; bad entries are explained', () => {
  const r = copy(RESULTS);
  r.tests.hip_adduction = { status: 'completed', left: '', right: '' };
  assert.throws(() => padel.validateInput(PROFILE, r), /Hip Adduction: enter at least one side/);
  const c = copy(RESULTS);
  c.tests.shoulder_er.cutoffs = ['50', '170', '120', '80'];
  assert.throws(() => padel.validateInput(PROFILE, c), /Shoulder External Rotation: enter all 4 VALD cut-offs/);
});

test('Gemini payload: padel battery, dominant hand, no athlete name', () => {
  const { session } = padel.validateInput(PROFILE, RESULTS);
  const scored = scoreSession(session, padel.cfg);
  const payload = padel.buildGeminiPayload(scored, session);
  assert.equal(JSON.stringify(payload).includes('Sara'), false);
  assert.equal(payload.sport, 'padel');
  assert.equal(payload.config_version, 'padel-v1.0');
  assert.equal(payload.athlete.dominant_hand, 'R');
  assert.deepEqual(payload.tests.map(t => t.name), ['10m Sprint', 'Ruler Drop', 'Beep Test',
    'Single Leg Stand (Eyes Closed)', 'Trunk Rotation', 'Overhead Squat',
    'Shoulder External Rotation', 'Hip Abduction', 'Hip Adduction']);
  // R (dominant) is the weaker shoulder: monitor, not red. Adduction 193 / abduction 255 = 75.7%: groin flag.
  assert.deepEqual(payload.flags, [
    { type: 'LSI', test: 'Shoulder External Rotation', value: 78.7, level: 'monitor', dominant_side_weaker: true, gap_pct: 21.3 },
    { type: 'groin_risk', test: 'Hip Adduction', value: 75.7, level: 'amber' }
  ]);
  assert.equal(payload.stats.agility.status, 'not_in_battery');
  assert.equal(payload.stats.endurance.status, 'not_tested');
});

test('padel system prompt: the football rules plus the padel rules', () => {
  for (const rule of ['Use only numbers present in the payload', 'not tested this session', 'firm up after the remaining tests',
    'never as diagnoses', 'compared with published international norms', 'compared with others of the same age and sex',
    'compared with padel players', 'common in racket players', 'something to monitor', 'groin_risk']) {
    assert.ok(padel.SYSTEM_PROMPT.includes(rule), rule);
  }
  assert.equal(padel.SYSTEM_PROMPT.includes('football'), false);
});

test('number check rejects invented numbers and retries', async () => {
  const { session } = padel.validateInput(PROFILE, RESULTS);
  const payload = padel.buildGeminiPayload(scoreSession(session, padel.cfg), session);
  assert.deepEqual(findUnsupportedNumbers({ a: 'LSI 78.7%, groin ratio 75.7%' }, payload), []);
  assert.deepEqual(findUnsupportedNumbers({ a: 'Endurance roughly 60' }, payload), [60]);
  let calls = 0;
  const callModel = async () => {
    calls++;
    return calls === 1 ? JSON.stringify({ ...JSON.parse(fakeNarrative(payload)), summary: 'About 60 for endurance.' }) : fakeNarrative(payload);
  };
  const { attempts } = await padel.generateNarrative(payload, { callModel });
  assert.equal(attempts, 2);
});

test('full pipeline: padel card content', async () => {
  const { profile, session } = padel.validateInput(PROFILE, RESULTS);
  let prompt;
  const callModel = async (system, p) => { prompt = p; return fakeNarrative(JSON.parse(p.slice(p.indexOf('{')))); };
  const { reportContent: rc, scored } = await padel.runPipeline(profile, session, { callModel });

  assert.match(prompt, /^Write the report text for this padel testing session/);
  assert.equal(rc.sport, 'Padel');
  assert.equal(rc.batteryLabel, 'Padel Battery v1');
  assert.equal(rc.position, 'LEFT');
  assert.equal(rc.dominantHand, 'R');
  assert.equal(rc.configVersion, 'padel-v1.0');
  assert.equal(rc.overallOVR, scored.ovr.value);
  assert.equal(rc.ovrStatus, 'provisional');                       // beep not done + female
  assert.deepEqual(rc.ovrReasons, ['Beep Test not completed: not done', 'benchmarks are adult male only']);
  assert.deepEqual(rc.ovrScores.find(s => s.name === 'Agility'), { name: 'Agility', score: null, status: 'not_in_battery' });
  assert.deepEqual(rc.manualBattery.map(t => t.test), ['10m Sprint', 'Ruler Drop', 'Beep Test']);
  assert.deepEqual(rc.dynamoStrength.map(d => [d.joint, d.lsi, d.status]), [
    ['Shoulder External Rotation', 78.7, 'MONITOR — DOMINANT ARM'],
    ['Hip Abduction', 96.2, 'WITHIN RANGE'],
    ['Hip Adduction', 96.9, 'WITHIN RANGE']
  ]);
  assert.deepEqual(rc.movementScreen.map(m => m.test), ['Single Leg Stand (Eyes Closed)', 'Trunk Rotation', 'Overhead Squat']);
  assert.equal(rc.testTable.length, 9);
  assert.deepEqual(rc.testTable[0], { test: '10m Sprint', result: '1.82', unit: 's', timing: 'hand',
    score: scored.tests[0].score, status: 'completed', partial: false, oneSideOnly: false, feedsOvr: true });
  assert.deepEqual(rc.flags.map(f => [f.test, f.type, f.level, f.value, !!f.dominantSideWeaker]), [
    ['Shoulder External Rotation', 'LSI', 'monitor', 78.7, true],
    ['Hip Adduction', 'groin_risk', 'amber', 75.7, false]
  ]);
  assert.equal(scored.stats.power.capped, undefined);               // monitor never caps power
});

test('additional VALD results: shown on the report, never scored, never sent to Gemini', async () => {
  const withExtra = { ...copy(RESULTS), additionalVald: [
    { test: 'Knee Flexion', device: 'Dynamo', unit: 'N', left: '250', right: 241, date: '2026-10-01T09:10:00Z', stat: 'power', band_left: 'below', band_right: 'made_up', symmetry: 12 },
    { test: 'Squat — Depth', device: 'HumanTrak', unit: '°', value: 92.04, stat: 'cheating', band: 'within_normal' },
    { test: 'Waiting for a metric', device: 'HumanTrak' }                                     // no values: dropped
  ] };
  const plain = padel.validateInput(PROFILE, copy(RESULTS));
  const { profile, session } = padel.validateInput(PROFILE, withExtra);
  assert.deepEqual(session, plain.session);                                 // scoring input unchanged
  assert.deepEqual(profile.additionalVald, [
    { test: 'Knee Flexion', device: 'Dynamo', unit: 'N', left: 250, right: 241, symmetry: 96.4, date: '2026-10-01', stat: 'power', band_left: 'below', band_right: null },
    { test: 'Squat — Depth', device: 'HumanTrak', unit: '°', value: 92, symmetry: null, date: '', stat: null, band: 'within_normal' }
  ]);
  let seen = '';
  const callModel = async (sys, prompt) => { seen = prompt; return fakeNarrative(JSON.parse(prompt.split('PAYLOAD:\n')[1])); };
  const out = await padel.runPipeline(profile, session, { callModel });
  const base = await padel.runPipeline(plain.profile, plain.session, { callModel: async (s, p) => fakeNarrative(JSON.parse(p.split('PAYLOAD:\n')[1])) });
  assert.equal(out.scored.ovr.value, base.scored.ovr.value);                  // OVR identical
  assert.deepEqual(out.payload, base.payload);                               // Gemini payload identical
  assert.equal(seen.includes('Knee Flexion'), false);
  assert.equal(out.reportContent.additionalVald.length, 2);
});

test('wording: a padel report (Agility not tested) is never called "comprehensive" or "complete"', async () => {
  const { findWordingProblems } = require('./scoredReport.service');
  const full = copy(RESULTS);
  full.tests.beep_test = { status: 'completed', level: '9', shuttle: '4' };
  const { session } = padel.validateInput(PROFILE, full);
  const payload = padel.buildGeminiPayload(scoreSession(session, padel.cfg), session);
  // Every padel test done, but Agility is not in the battery.
  assert.deepEqual(payload.session, { everything_tested: false, not_tested: ['Agility (stat)'] });

  const bad = (summary, p = payload) => findWordingProblems({ summary }, p).length;
  for (const s of [
    'The athlete completed a comprehensive testing session.',
    'The athlete completed a compre\u00ADhensive testing session.',   // soft hyphen
    'The athlete completed a compre\u200Bhensive testing session.',   // zero-width space
    'The athlete completed a ｃｏｍｐｒｅｈｅｎｓｉｖｅ testing session.', // full-width
    'A complete\u00A0testing session.',                                // non-breaking space
    'A full padel testing session.',
    'This thorough physical assessment shows good speed.',
    'An exhaustive look at the athlete.',
    'All tests were completed.'
  ]) assert.equal(bad(s), 1, s);
  for (const s of [
    'The athlete completed a testing session covering speed, power, balance and reaction. Agility was not tested this session.',
    'The rating will firm up once the remaining tests are complete.',
    'Complete the remaining tests to firm up the rating.',
    'Not all tests were completed.',
    'Shows full range of motion at the hip.'
  ]) assert.equal(bad(s), 0, s);
  // An older payload without a session block is still checked.
  const { session: _s, ...old } = payload;
  assert.equal(bad('A comprehensive testing session.', old), 1);

  const prompts = [];
  const callModel = async (system, prompt) => {
    prompts.push(prompt);
    const n = JSON.parse(fakeNarrative(payload));
    if (prompts.length === 1) n.summary = 'The athlete completed a comprehensive testing session.';
    return JSON.stringify(n);
  };
  const { narrative, attempts } = await padel.generateNarrative(payload, { callModel });
  assert.equal(attempts, 2);
  assert.match(prompts[1], /not tested \(Agility \(stat\)\)/);
  assert.equal(/comprehensive/i.test(narrative.summary), false);
});

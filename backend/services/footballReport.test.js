// Run: npm test   (from backend/)
// Football report pipeline: input checks, Gemini payload, the "no invented
// numbers" check and the card the report page shows. Gemini is faked here,
// so these run without an API key.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateFootballInput, buildGeminiPayload, findUnsupportedNumbers,
  generateNarrative, runFootballPipeline, SYSTEM_PROMPT
} = require('./footballReport.service');
const { scoreSession } = require('../scoring/scoring');

// Form entry equivalent to peakperformance_scoring/sample_session.json
// (values arrive from the form as strings).
const PROFILE = {
  name: 'Ali Khan', dob: '2007-03-02', testDate: '2026-10-11', sex: 'M', position: 'MID',
  bodyweight: '71.4', trainingLevel: 'Semi-Professional', athleteId: 'PP-0142'
};
const FOOTBALL = {
  timingMethod: 'hand',
  tests: {
    sprint_10m: { status: 'completed', value: '1.70' },
    sprint_30m: { status: 'completed', value: '4.21' },
    ruler_drop: { status: 'completed', value: '14.5' },
    beep_test: { status: 'injured', level: '', shuttle: '' },
    single_leg_stand: { status: 'completed', left: '18', right: '22', cutoffs: ['3', '8', '15', '25'] },
    trunk_rotation: { status: 'completed', left: '42', right: '40', cutoffs: ['20', '30', '40', '55'] },
    overhead_squat: { status: 'completed', value: '68', cutoffs: ['', '', '', ''], band: 'within_normal' },
    hip_extension: { status: 'completed', left: '410', right: '395', cutoffs: ['150', '250', '350', '500'] },
    knee_extension: { status: 'completed', left: '612', right: '533', cutoffs: ['200', '300', '450', '600'] }
  }
};

const copy = (o) => structuredClone(o);

const goodNarrative = (payload) => JSON.stringify({
  playerProfile: 'Quick off the mark with a strong lower body.',
  summary: 'A strong session. The rating will firm up after the remaining tests.',
  stats: {
    speed: 'Quick over the first steps, compared with published international norms.',
    power: 'Strong hip and knee extension compared with others of the same age and sex.',
    agility: 'Not tested this session.',
    endurance: 'Not tested this session.',
    balance: 'Steady on one leg.',
    reaction: `Sharp reactions: ${payload.stats.reaction.value} on the card.`
  },
  symmetry: 'Knee extension is stronger on the left; an area to work on.',
  recommendation: 'Single-leg strength work for the right knee.',
  flags: payload.flags.map(f => `${f.test}: an area to work on.`)
});

test('form entry becomes the same session as sample_session.json', () => {
  const { profile, session } = validateFootballInput(PROFILE, FOOTBALL);
  assert.equal(profile.age, 19);
  assert.equal(profile.bodyweight, 71.4);
  assert.deepEqual(session.athlete, { id: 'PP-0142', age: 19, sex: 'M', position: 'MID' });
  assert.deepEqual(session.tests.beep_test, { status: 'injured' });
  assert.deepEqual(session.tests.overhead_squat, { status: 'completed', value: 68, band: 'within_normal' });
  assert.deepEqual(session.tests.knee_extension, { status: 'completed', left: 612, right: 533, cutoffs: [200, 300, 450, 600] });
});

test('required profile fields are enforced', () => {
  for (const [field, value, msg] of [
    ['dob', '', /Date of birth/],
    ['sex', 'X', /Sex/],
    ['position', 'Winger', /Position/],
    ['bodyweight', '', /Bodyweight is required/],
    ['bodyweight', '250', /30–160 kg/]
  ]) {
    assert.throws(() => validateFootballInput({ ...PROFILE, [field]: value }, FOOTBALL), msg);
  }
  assert.throws(() => validateFootballInput(PROFILE, { ...FOOTBALL, timingMethod: '' }), /Timing method/);
});

test('completed tests need their values; bad entries are explained', () => {
  const f = copy(FOOTBALL);
  f.tests.sprint_30m = { status: 'completed', value: '' };
  assert.throws(() => validateFootballInput(PROFILE, f), /30m Sprint: enter a value/);

  const b = copy(FOOTBALL);
  b.tests.beep_test = { status: 'completed', level: '11', shuttle: '20' };
  assert.throws(() => validateFootballInput(PROFILE, b), /shuttle must be a whole number from 0 to 12/);

  const c = copy(FOOTBALL);
  c.tests.hip_extension.cutoffs = ['150', '500', '350', '250'];
  assert.throws(() => validateFootballInput(PROFILE, c), /4 VALD cut-offs, lowest first/);

  const n = copy(FOOTBALL);
  n.tests.trunk_rotation = { status: 'completed', left: '42', right: '40' };
  assert.throws(() => validateFootballInput(PROFILE, n), /cut-offs, or the VALD band/);
});

test('out-of-range value is scored invalid, never a low score', () => {
  const f = copy(FOOTBALL);
  f.tests.sprint_30m.value = '2.1';
  const { session } = validateFootballInput(PROFILE, f);
  const t = scoreSession(session).tests.find(x => x.name === 'sprint_30m');
  assert.equal(t.status, 'invalid');
  assert.equal(t.score, null);
});

test('Gemini payload follows the spec and carries no athlete name', () => {
  const { session } = validateFootballInput(PROFILE, FOOTBALL);
  const scored = scoreSession(session);
  const payload = buildGeminiPayload(scored, session);
  assert.equal(JSON.stringify(payload).includes('Ali'), false);
  assert.equal(payload.config_version, 'football-v1.1');
  assert.deepEqual(payload.ovr, { value: 71, provisional: true, reasons: ['Beep Test not completed: injured'] });
  const knee = payload.tests.find(t => t.name === 'Knee Extension');
  assert.equal(knee.raw_left, 612);
  assert.equal(knee.unit, 'N');
  assert.equal(knee.benchmark, 'vald_age_sex');
  assert.equal(knee.lsi, 87.1);
  const sprint = payload.tests.find(t => t.name === '30m Sprint');
  assert.equal(sprint.timing, 'hand');
  assert.deepEqual(payload.flags[0], { type: 'LSI', test: 'Knee Extension', value: 87.1, level: 'amber', gap_pct: 12.9 });
  for (const rule of ['Use only numbers present in the payload', 'not tested this session', 'firm up after the remaining tests',
    'never as diagnoses', 'compared with published international norms', 'compared with others of the same age and sex']) {
    assert.ok(SYSTEM_PROMPT.includes(rule), rule);
  }
});

test('number check catches invented numbers, allows payload numbers', () => {
  const { session } = validateFootballInput(PROFILE, FOOTBALL);
  const payload = buildGeminiPayload(scoreSession(session), session);
  assert.deepEqual(findUnsupportedNumbers({ a: 'OVR 71, 30m Sprint 4.21 s, LSI 87.1%' }, payload), []);
  assert.deepEqual(findUnsupportedNumbers({ a: 'OVR 71.0' }, payload), []);
  assert.deepEqual(findUnsupportedNumbers({ a: 'Endurance around 64', b: ['6.25% of the weight'] }, payload), [64, 6.25]);
});

test('Gemini answer with an invented number is rejected and retried', async () => {
  const { session } = validateFootballInput(PROFILE, FOOTBALL);
  const payload = buildGeminiPayload(scoreSession(session), session);
  const prompts = [];
  let call = 0;
  const callModel = async (system, prompt) => {
    prompts.push(prompt);
    call++;
    if (call === 1) return JSON.stringify({ ...JSON.parse(goodNarrative(payload)), summary: 'Endurance would be about 64.' });
    return goodNarrative(payload);
  };
  const { narrative, attempts } = await generateNarrative(payload, { callModel });
  assert.equal(attempts, 2);
  assert.match(prompts[1], /numbers that are not in the payload: 64/);
  assert.equal(narrative.stats.agility, 'Not tested this session.');
});

test('wording: never "comprehensive"/"complete" when anything is Not tested; LSI as symmetry', async () => {
  const { findWordingProblems } = require('./scoredReport.service');
  const { session } = validateFootballInput(PROFILE, FOOTBALL);
  const payload = buildGeminiPayload(scoreSession(session), session);
  // Beep Test injured and Agility not in the battery: not everything was tested.
  assert.equal(payload.session.everything_tested, false);
  assert.ok(payload.session.not_tested.includes('Beep Test'));
  assert.ok(payload.session.not_tested.includes('Agility (stat)'));
  assert.equal(payload.tests.find(t => t.name === 'Knee Extension').lsi_gap_pct, 12.9);
  for (const rule of ['never call the session', '"comprehensive" or "complete"', '% symmetry', 'Never write "asymmetry of <number>"']) {
    assert.ok(SYSTEM_PROMPT.includes(rule), rule);
  }

  const bad = (summary) => findWordingProblems({ summary }, payload);
  assert.equal(bad('A comprehensive testing session for the athlete.').length, 1);
  assert.equal(bad('This complete assessment shows good speed.').length, 1);
  assert.equal(bad('Knee Extension shows an asymmetry of 87.1.').length, 1);
  assert.equal(bad('Knee Extension asymmetry: 87.1%.').length, 1);
  assert.deepEqual(bad('Knee Extension shows 87.1% symmetry, a 12.9% gap between sides.'), []);
  assert.deepEqual(bad('The rating will firm up once the remaining tests are complete.'), []);
  assert.deepEqual(bad('Some asymmetry between legs is worth training.'), []);
  // With everything tested, "complete" is allowed.
  assert.deepEqual(findWordingProblems({ s: 'A complete testing session.' }, { ...payload, session: { everything_tested: true, not_tested: [] } }), []);

  const prompts = [];
  const callModel = async (system, prompt) => {
    prompts.push(prompt);
    if (prompts.length === 1) return JSON.stringify({ ...JSON.parse(goodNarrative(payload)), summary: 'A comprehensive testing session.' });
    return goodNarrative(payload);
  };
  const { attempts } = await generateNarrative(payload, { callModel });
  assert.equal(attempts, 2);
  assert.match(prompts[1], /"comprehensive" or "complete" although some tests or stats were not tested \(Beep Test/);
});

test('report fails cleanly after three bad answers', async () => {
  const { session } = validateFootballInput(PROFILE, FOOTBALL);
  const payload = buildGeminiPayload(scoreSession(session), session);
  let calls = 0;
  const callModel = async () => { calls++; return '{"summary": "Probably a 64 for endurance."}'; };
  await assert.rejects(generateNarrative(payload, { callModel }), /rejected 3 times/);
  assert.equal(calls, 3);
});

test('full pipeline: sample session gives OVR 71 provisional on the card', async () => {
  const { profile, session } = validateFootballInput(PROFILE, FOOTBALL);
  let payloadSeen;
  const callModel = async (system, prompt) => {
    payloadSeen = JSON.parse(prompt.slice(prompt.indexOf('{')));
    return goodNarrative(payloadSeen);
  };
  const { reportContent: rc, scored } = await runFootballPipeline(profile, session, { callModel });

  assert.equal(scored.ovr.value, 71);
  assert.equal(rc.overallOVR, 71);
  assert.equal(rc.ovrStatus, 'provisional');
  assert.deepEqual(rc.ovrReasons, ['Beep Test not completed: injured']);
  assert.deepEqual(rc.ovrScores.map(s => [s.name, s.score]),
    [['Speed', 61], ['Agility', null], ['Power', 79], ['Endurance', null], ['Reaction', 74], ['Balance', 78]]);
  const beep = rc.manualBattery.find(t => t.test === 'Beep Test');
  assert.equal(beep.score, null);
  assert.equal(beep.avg, 'Not tested — injured');
  assert.equal(rc.manualBattery[0].raw, '1.7 s (hand)');
  assert.deepEqual(rc.dynamoStrength.map(d => [d.joint, d.lsi, d.status]),
    [['Hip Extension', 96.3, 'WITHIN RANGE'], ['Knee Extension', 87.1, 'REVIEW — AMBER']]);
  assert.equal(rc.symmetrySummary.lowest, '87.1% — Knee Extension');
  assert.equal(rc.fieldMeaning.developmentPriority, 'Speed');
  assert.equal(rc.fieldMeaning.stats.find(s => s.name === 'Agility').tag, 'NOT TESTED');
  assert.equal(rc.flags[0].note, 'Knee Extension: an area to work on.');
  assert.equal(rc.configVersion, 'football-v1.1');
  assert.deepEqual(rc.testTable.map(r => [r.test, r.result, r.unit, r.score, r.status]), [
    ['10m Sprint', '1.7', 's', 59.5, 'completed'],
    ['30m Sprint', '4.21', 's', 62.2, 'completed'],
    ['Ruler Drop', '14.5', 'cm', 74.5, 'completed'],
    ['Beep Test', '—', 'level.shuttle', null, 'injured'],
    ['Single Leg Stand (Eyes Closed)', 'L 18 · R 22', 's', 77.5, 'completed'],
    ['Trunk Rotation', 'L 42 · R 40', '°', 71, 'completed'],
    ['Overhead Squat', '68', 'score', 63, 'completed'],
    ['Hip Extension', 'L 410 · R 395', 'N', 75.2, 'completed'],
    ['Knee Extension', 'L 612 · R 533', 'N', 82.2, 'completed']
  ]);
  assert.equal(rc.testTable[0].timing, 'hand');
  assert.equal(rc.testTable[6].partial, true);
});

// Run: npm test   (from backend/)
// Custom assessment: per-session config, scoring, OVR rule (3+ stats, equal
// weights), "No OVR: custom session", flags, number check — and the three
// sports untouched.

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCustomConfig, manualLibrary, valdFormTests } = require('./customAssessment.service');
const { forCustom, forSport, findUnsupportedNumbers } = require('./scoredReport.service');
const { loadConfig, scoreSession } = require('../scoring/scoring');
const { mapLatestResults } = require('./vald/valdMapping');
const { valdBattery } = require('./customAssessment.service');

const PROFILE = { name: 'Arhum Latif', dob: '1999-04-02', testDate: '2026-10-13', sex: 'M', bodyweight: '74', trainingLevel: 'Elite', position: 'Wing' };
const CUTS = ['100', '200', '300', '400'];

const fakeNarrative = (payload) => JSON.stringify({
  playerProfile: 'Quick and strong.', summary: 'A focused custom session.',
  stats: { speed: 'Quick.', power: 'Strong.', agility: 'Sharp turns.', endurance: 'Not tested.', balance: 'Not tested.', reaction: 'Not tested.' },
  symmetry: 'Balanced.', recommendation: 'Keep going.', flags: payload.flags.map(() => 'Work on this.')
});
const callModel = async (sys, prompt) => fakeNarrative(JSON.parse(prompt.split('PAYLOAD:\n')[1]));

const TESTS = [
  { key: 'sprint_10m', kind: 'manual' },
  { key: 'cod_505', kind: 'manual' },
  { key: 'knee_extension', kind: 'vald', valdKey: 'dynamo:kneeextension', device: 'Dynamo', bilateral: true },
  { key: 'vald_dynamo_kneeflexion', kind: 'vald', valdKey: 'dynamo:kneeflexion', device: 'Dynamo', label: 'Knee Flexion', unit: 'N', bilateral: true },
  { key: 'vald_dynamo_anklepf', kind: 'vald', valdKey: 'dynamo:anklepf', device: 'Dynamo', label: 'Ankle Plantarflexion', unit: 'N', bilateral: true }
];
const MAPPINGS = { 'dynamo:kneeflexion': { use: 'stat', stat: 'power' } };          // anklepf: unmapped

test('config: manual anchors from the chosen sport (or the only sport that has the test); stats from VALD test mapping', () => {
  const { cfg, testInfo, shownOnly } = buildCustomConfig({ testsIn: TESTS, benchmarkSport: 'padel', mappings: MAPPINGS });
  assert.deepEqual(cfg.manual_anchors.sprint_10m, loadConfig('padel').manual_anchors.sprint_10m);
  assert.deepEqual(cfg.manual_anchors.cod_505, loadConfig('cricket').manual_anchors.cod_505);      // only cricket has 505
  assert.equal(cfg.tests.cod_505.benchmark_from, 'cricket');
  assert.equal(cfg.tests.knee_extension.stat, 'power');                       // battery test keeps its stat
  assert.equal(cfg.tests.vald_dynamo_kneeflexion.stat, 'power');              // from the admin's mapping
  assert.equal(cfg.tests.vald_dynamo_kneeflexion.dynamo, true);               // so LSI rules apply
  assert.equal(cfg.tests.vald_dynamo_anklepf, undefined);                     // unmapped: not scored
  assert.deepEqual(shownOnly.map(s => s.key), ['vald_dynamo_anklepf']);
  assert.deepEqual(testInfo.vald_dynamo_kneeflexion, { label: 'Knee Flexion', unit: 'N' });
  assert.deepEqual(cfg.stat_weights, { speed: 1, power: 1, agility: 1, endurance: 1, balance: 1, reaction: 1 });
  assert.equal(cfg.ovr_min_stats, 3);
});

test('config: "show only" mapping and bad input are handled', () => {
  const { cfg, shownOnly } = buildCustomConfig({ testsIn: TESTS, mappings: { ...MAPPINGS, 'dynamo:kneeextension': { use: 'show' } } });
  assert.equal(cfg.tests.knee_extension, undefined);
  assert.ok(shownOnly.some(s => s.key === 'knee_extension'));
  assert.throws(() => buildCustomConfig({ testsIn: [{ key: 'bench_press', kind: 'manual' }] }), /Unknown manual test/);
  assert.throws(() => buildCustomConfig({ testsIn: [{ key: 'vald_x', kind: 'vald', valdKey: 'dropdb:1' }] }), /Unknown VALD test/);
  assert.throws(() => buildCustomConfig({ testsIn: [] }), /at least one test/);
  assert.throws(() => buildCustomConfig({ testsIn: TESTS, benchmarkSport: 'golf' }), /Benchmark sport/);
});

test('OVR: equal weights across scored stats when 3+ stats are scored', async () => {
  const testsIn = [...TESTS, { key: 'ruler_drop', kind: 'manual' }];
  const { cfg, testInfo } = buildCustomConfig({ testsIn, benchmarkSport: 'football', mappings: MAPPINGS });
  const p = forCustom(cfg, testInfo);
  const { profile, session } = p.validateInput(PROFILE, { timingMethod: 'electronic', tests: {
    sprint_10m: { status: 'completed', value: '1.85' },
    cod_505: { status: 'completed', value: '2.59' },
    ruler_drop: { status: 'completed', value: '16' },
    knee_extension: { status: 'completed', left: '350', right: '340', cutoffs: CUTS },
    vald_dynamo_kneeflexion: { status: 'completed', left: '250', right: '245', cutoffs: CUTS }
  } });
  const { scored, reportContent: rc, payload } = await p.runPipeline(profile, session, { callModel });
  const s = scored.stats;
  assert.equal(s.speed.value, 70);
  assert.equal(s.agility.value, 70);
  assert.equal(s.reaction.value, 70);
  const vals = ['speed', 'power', 'agility', 'reaction'].map(k => s[k].value);
  assert.equal(scored.ovr.value, Math.round(vals.reduce((a, b) => a + b, 0) / 4));   // plain mean
  assert.equal(rc.sport, 'Custom Assessment');
  assert.equal(rc.batteryLabel, 'Custom Assessment');
  assert.equal(rc.position, 'WING');
  assert.ok(rc.testTable.some(t => t.test === 'Knee Flexion'));
  assert.deepEqual(findUnsupportedNumbers(JSON.parse(fakeNarrative(payload)), payload), []);
});

test('fewer than 3 scored stats: "No OVR: custom session", stats and tests still shown', async () => {
  const { cfg, testInfo } = buildCustomConfig({ testsIn: TESTS.slice(0, 3), mappings: MAPPINGS });
  const p = forCustom(cfg, testInfo);
  const { profile, session } = p.validateInput(PROFILE, { timingMethod: 'hand', tests: {
    sprint_10m: { status: 'completed', value: '1.9' },
    cod_505: { status: 'not_done' },
    knee_extension: { status: 'completed', left: '350', right: '340', cutoffs: CUTS }
  } });
  const { scored, reportContent: rc } = await p.runPipeline(profile, session, { callModel });
  assert.equal(scored.ovr.value, null);
  assert.equal(scored.ovr.message, 'No OVR: custom session');
  assert.equal(rc.ovrMessage, 'No OVR: custom session');
  assert.notEqual(rc.ovrScores.find(x => x.name === 'Speed').score, null);
  assert.ok(rc.ovrReasons.some(r => /505 Agility not completed/.test(r)));          // missing-data rules as usual
  assert.equal(rc.testTable.length, 3);
});

test('provisional, LSI flag and power cap follow the usual rules', async () => {
  const testsIn = [...TESTS, { key: 'ruler_drop', kind: 'manual' }];
  const { cfg, testInfo } = buildCustomConfig({ testsIn, mappings: MAPPINGS });
  const p = forCustom(cfg, testInfo);
  const { profile, session } = p.validateInput({ ...PROFILE, sex: 'F' }, { timingMethod: 'electronic', tests: {
    sprint_10m: { status: 'completed', value: '1.85' }, cod_505: { status: 'completed', value: '2.59' },
    ruler_drop: { status: 'completed', value: '16' },
    knee_extension: { status: 'completed', left: '420', right: '300', cutoffs: CUTS },          // LSI 71.4 -> red
    vald_dynamo_kneeflexion: { status: 'completed', left: '420', right: '410', cutoffs: CUTS }
  } });
  const { scored } = await p.runPipeline(profile, session, { callModel });
  assert.equal(scored.ovr.provisional, true);
  assert.ok(scored.ovr.reasons.includes('benchmarks are adult male only'));
  assert.ok(scored.flags.some(f => f.type === 'LSI' && f.test === 'knee_extension' && f.level === 'red'));
  assert.ok(scored.stats.power.value <= cfg.lsi.power_cap);
});

test('Gemini: number check rejects invented numbers; prompt says custom', async () => {
  const { cfg, testInfo } = buildCustomConfig({ testsIn: TESTS.slice(0, 1), mappings: {} });
  const p = forCustom(cfg, testInfo);
  assert.match(p.SYSTEM_PROMPT, /custom assessment: only the tests in the payload/);
  assert.match(p.SYSTEM_PROMPT, /no overall rating for this custom session/);
  const { profile, session } = p.validateInput(PROFILE, { timingMethod: 'electronic', tests: { sprint_10m: { status: 'completed', value: '1.9' } } });
  const liar = async () => JSON.stringify({ ...JSON.parse(fakeNarrative({ flags: [] })), summary: 'Top 3% sprinter, 12.4 m/s.' });
  await assert.rejects(p.runPipeline(profile, session, { callModel: liar }), /rejected 3 times/);
});

test('VALD pull for custom: every latest test becomes a form test with its stat (or none)', () => {
  const dyn = (id, region, movement, l, r) => ({ id, athleteId: 'P1', bodyRegion: region, movement, startTimeUTC: '2026-10-01T09:00:00Z',
    repetitionTypeSummaries: [{ movement, laterality: 'LeftSide', maxForceNewtons: l }, { movement, laterality: 'RightSide', maxForceNewtons: r }] });
  const mapped = mapLatestResults({ dynamo: [dyn('a', 'Knee', 'Extension', 500, 480), dyn('b', 'Knee', 'Flexion', 250, 240), dyn('c', 'Ankle', 'Plantarflexion', 800, 790)] }, valdBattery(), MAPPINGS);
  const { tests } = valdFormTests(mapped, MAPPINGS);
  const by = Object.fromEntries(tests.map(t => [t.key, t]));
  assert.deepEqual({ v: by.knee_extension.valdKey, s: by.knee_extension.stat, src: by.knee_extension.statSource, l: by.knee_extension.left }, { v: 'dynamo:kneeextension', s: 'power', src: 'built_in', l: 500 });
  assert.equal(by.vald_dynamo_kneeflexion.stat, 'power');
  assert.equal(by.vald_dynamo_kneeflexion.statSource, 'mapping');
  assert.equal(by.vald_dynamo_ankleplantarflexion.stat, null);
  assert.equal(by.vald_dynamo_ankleplantarflexion.statSource, 'unmapped');
});

test('manual test list for the form', () => {
  const lib = Object.fromEntries(manualLibrary('football').map(t => [t.key, t]));
  assert.deepEqual(Object.keys(lib), ['sprint_10m', 'sprint_20m', 'sprint_30m', 'ruler_drop', 'cod_505', 'medicine_ball']);   // no Beep Test or Yo-Yo
  assert.equal(lib.sprint_10m.benchmarkFrom, 'football');
  assert.equal(lib.cod_505.benchmarkFrom, 'cricket');                 // one time, cricket's own scale
  assert.equal(lib.medicine_ball.benchmarkPending, true);
});

test('football, padel and cricket are unchanged', () => {
  for (const sport of ['football', 'padel', 'cricket']) {
    const p = forSport(sport);
    assert.equal(p.cfg, loadConfig(sport));
    assert.match(p.SYSTEM_PROMPT, /Endurance is not in the current test battery: say it was not tested this session\./);
    assert.match(p.SYSTEM_PROMPT, /If the OVR value is null, say the overall rating is pending until testing is complete\./);
    assert.throws(() => p.validateInput({ ...PROFILE, position: 'Wing' }, {}), /required/);
  }
  // Engine output for a football session is the same as calling the engine directly.
  const session = { athlete: { age: 27, sex: 'M', position: 'MID' }, timing_method: 'electronic', tests: { sprint_10m: { status: 'completed', value: 1.85 } } };
  assert.deepEqual(scoreSession(session, loadConfig('football')).ovr.message, 'OVR pending: complete testing');
});

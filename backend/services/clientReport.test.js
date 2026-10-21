// Run: npm test   (from backend/)
// Client card reports: input checks, engine-chosen text, the AI's rewording
// checks, "how we score" pages and the breakdown.

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateClientInput, runClientPipeline, problemsWith } = require('./clientReport.service');
const { machineTestsFromPdf } = require('./machineCard.service');
const { parsePages } = require('./vald/valdHubPdf');
const { methodology, reportBreakdown } = require('./methodology.service');
const PAGES = require('./vald/fixtures/valdHubPdf.pages.json');

const TESTS = machineTestsFromPdf(parsePages(PAGES));
const PROFILE = { name: 'Test Athlete', dob: '2003-01-01', testDate: '2026-10-21', sex: 'M', dominantHand: 'R', position: 'right' };
const input = (sport = 'padel') => validateClientInput(PROFILE, { sport, tests: TESTS });
const noAi = { callModel: async () => { throw new Error('no key'); } };

test('input: sport, profile and VALD tests are checked', () => {
  const i = input();
  assert.equal(i.profile.age, 23);
  assert.equal(i.profile.position, 'RIGHT');
  assert.equal(i.tests.length, 7);
  assert.throws(() => validateClientInput(PROFILE, { sport: 'tennis', tests: TESTS }), /Sport must be/);
  assert.throws(() => validateClientInput({ ...PROFILE, sex: '' }, { sport: 'padel', tests: TESTS }), /Sex is required/);
  assert.throws(() => validateClientInput(PROFILE, { sport: 'padel', tests: [] }), /No VALD results/);
  const bad = JSON.parse(JSON.stringify(TESTS));
  bad[0].sides.left.percentile = 140;
  assert.throws(() => validateClientInput(PROFILE, { sport: 'padel', tests: bad }), /percentile must be 0–100/);
});

test('no AI: the report uses the code\'s own sentences, and keeps the draft footer', async () => {
  const { reportContent: rc, polish } = await runClientPipeline(input(), noAi);
  assert.equal(polish.source, 'coach');
  assert.equal(rc.proseSource, 'coach');
  assert.equal(rc.draftNotice, 'Draft – pending clinical review');
  assert.match(rc.benchmarkNote, /^Scores come from VALD's age- and sex-matched data/);
  assert.equal(rc.summary, 'Your rating is pending: 2 of 5 stats are scored, and a rating needs 3. Your development priority is Mobility.');
  assert.deepEqual(rc.fieldMeaning.stats.map(s => [s.name, s.status]), [
    ['Strength', 'scored'], ['Symmetry', 'proposed'], ['Balance', 'not_tested'], ['Movement', 'not_tested'], ['Mobility', 'scored'], ['Speed', 'locked']
  ]);
  assert.match(rc.fieldMeaning.focus, /Add Single Leg Stand and Overhead Squat to your next session to complete your card\./);
});

test('arm tests: playing arm vs other arm, shown and never scored or flagged', async () => {
  const { reportContent: rc, card } = await runClientPipeline(input('cricket'), noAi);
  assert.equal(rc.armLabel, 'Playing arm vs other arm');
  assert.deepEqual(rc.armComparison.map(a => [a.test, a.labels[0], a.values, a.otherPct]), [
    ['Shoulder External Rotation', 'Playing arm', [117, 90], 76.9],
    ['Shoulder Internal Rotation', 'Playing arm', [143, 147], 102.8]
  ]);
  assert.equal(rc.flags.length, 0);                              // the 23% shoulder gap is not a flag
  assert.equal(card.stats.symmetry.value, null);                 // cricket: hip extension only, not in this PDF
  const general = await runClientPipeline(input('general'), noAi);
  assert.equal(general.reportContent.armLabel, 'Dominant arm vs other arm');
});

test('AI rewording is used only when it passes every check', async () => {
  const first = await runClientPipeline(input(), noAi);
  const ct = first.coachText;
  const good = { summary: `Hi! ${ct.summary}`, stats: { ...ct.stats, strength: 'Your Strength is 49, an area to build: on average you are stronger than 32.5% of people your age and sex.' }, focus: ct.focus, flags: ct.flags };
  const { reportContent, polish } = await runClientPipeline(input(), { callModel: async () => JSON.stringify(good) });
  assert.equal(polish.source, 'gemini');
  assert.equal(reportContent.fieldMeaning.stats[0].body, good.stats.strength);

  const payload = { summary: ct.summary, stats: ct.stats, focus: ct.focus, flags: ct.flags };
  const check = (patch) => problemsWith({ ...good, ...patch, stats: { ...good.stats, ...(patch.stats || {}) } }, payload).join(' | ');
  assert.match(check({ summary: 'Your rating is 71.' }), /numbers that are not in the payload: 71/);
  assert.match(check({ focus: 'Do 3 sets of 10 to fix this.' }), /prescription/);
  assert.match(check({ focus: 'Add some lunges and planks.' }), /exercises or training.*lunges.*planks/);
  assert.match(check({ stats: { strength: 'Dynamo shows Strength 49.' } }), /testing device/);
  assert.match(check({ stats: { balance: 'Balance looks fine.' } }), /balance was not tested and must still say "not tested"/);

  const bad = await runClientPipeline(input(), { callModel: async () => JSON.stringify({ ...good, focus: 'Try squats and lunges.' }) });
  assert.equal(bad.polish.source, 'coach');                      // 3 rejections -> the code's own text
  assert.equal(bad.reportContent.fieldMeaning.focus, ct.focus);
});

test('"how we score": client pages say scores come from VALD\'s age- and sex-matched data', () => {
  for (const key of ['client-football', 'client-padel', 'client-cricket', 'general']) {
    const m = methodology(key);
    assert.equal(m.kind, 'client_card');
    assert.match(m.source, /^Every score comes from VALD's age- and sex-matched data/);
    assert.equal(m.draftNotice, 'Draft – pending clinical review');
  }
  const g = methodology('general');
  assert.deepEqual(g.stats.find(s => s.key === 'strength').tests, ['Shoulder External Rotation', 'Hip Abduction', 'Knee Extension']);
  assert.deepEqual(g.stats.find(s => s.key === 'symmetry').tests, ['Hip Abduction', 'Knee Extension']);
  assert.match(g.stats[0].how, /the 50th percentile .* scores 62/);
  assert.deepEqual(g.bands.map(b => b.score), [33, 48, 63, 78, 92]);
});

test('breakdown of a saved client card', async () => {
  const i = input('general');
  const { card } = await runClientPipeline(i, noAi);
  const b = reportBreakdown({ scoring: card, scoringSession: { client: true, ...i }, athleteName: 'Test Athlete', testDate: '2026-10-21', reportContent: { sport: 'General / Gym' } });
  assert.equal(b.kind, 'client_card');
  assert.equal(b.methodologyPath, '/how-we-score/general');
  assert.deepEqual(b.stats.map(s => [s.key, s.value]), [['strength', 49], ['symmetry', 95], ['balance', null], ['movement', null], ['mobility', 48]]);
});

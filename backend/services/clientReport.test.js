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

test('the session date is never today by default: the PDF\'s test date or the tester\'s', () => {
  assert.throws(() => validateClientInput({ ...PROFILE, testDate: '' }, { sport: 'padel', tests: TESTS }), /Enter the test date/);
});
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
  assert.deepEqual(rc.coachNote.map(p => [p.label, p.text]), [
    ['Your weapon', 'Symmetry is your highest stat at 95. It helps with pushing off equally to your forehand and backhand side.'],
    ['What\'s holding you back', 'Mobility is your lowest stat at 48. On Shoulder Arc of Motion, your right side is significantly below the normal range for people your age and sex.'],
    ['Next step', 'A 6-week Rebuild targets exactly this. Retest to see your progress.']
  ]);
  assert.equal(rc.ovrLine, 'OVR = average of your scored stats (4 of 5 scored).');
  assert.match(rc.benchmarkNote, /OVR = average of your scored stats \(4 of 5 scored\)\./);
  assert.equal(rc.tierProgress, null); // one standard card, no tiers
  assert.equal(rc.bookingLine, 'Book your Rebuild or retest: WhatsApp +92 303 901 9991');
  assert.deepEqual(rc.fieldMeaning.stats.map(s => [s.name, s.status]), [
    ['Strength', 'scored'], ['Symmetry', 'scored'], ['Balance', 'scored'], ['Movement', 'not_tested'], ['Mobility', 'scored'], ['Speed', 'locked']
  ]);
  assert.match(rc.fieldMeaning.focus, /Add Overhead Squat to your next session to complete your card\./);
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
  const good = { note: { ...ct.note, weapon: `Hi! ${ct.note.weapon}` }, stats: { ...ct.stats, strength: 'Your Strength is 49, an area to build: on average you are stronger than 32.5% of people your age and sex.' }, focus: ct.focus, flags: ct.flags };
  const { reportContent, polish } = await runClientPipeline(input(), { callModel: async () => JSON.stringify(good) });
  assert.equal(polish.source, 'gemini');
  assert.equal(reportContent.fieldMeaning.stats[0].body, good.stats.strength);

  assert.equal(reportContent.coachNote[0].text, good.note.weapon);
  const payload = { note: ct.note, stats: ct.stats, focus: ct.focus, flags: ct.flags };
  const check = (patch) => problemsWith({ ...good, ...patch, stats: { ...good.stats, ...(patch.stats || {}) } }, payload).join(' | ');
  assert.match(check({ note: { ...good.note, weapon: 'Your rating is 71.' } }), /numbers that are not in the payload: 71/);
  assert.match(check({ note: { ...good.note, holding: 'Mobility is your lowest stat. Your shoulder range is below normal.' } }), /note.holding dropped 48/);
  // No tiers on client cards, so the next step no longer has to name one.
  assert.doesNotMatch(check({ note: { ...good.note, next: 'A 6-week Rebuild targets exactly this. Retest soon.' } }), /must still name/);
  assert.match(check({ focus: 'Do 3 sets of 10 to fix this.' }), /prescription/);
  assert.match(check({ focus: 'Add some lunges and planks.' }), /exercises or training.*lunges.*planks/);
  assert.match(check({ stats: { strength: 'Dynamo shows Strength 49.' } }), /testing device/);
  assert.match(check({ stats: { movement: 'Movement looks fine.' } }), /movement was not tested and must still say "not tested"/);

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
  assert.deepEqual(b.stats.map(s => [s.key, s.value]), [['strength', 49], ['symmetry', 95], ['balance', 56], ['movement', null], ['mobility', 48]]);
});

test('areas to work on: chosen in code, 2–3, never empty', async () => {
  const { reportContent: rc } = await runClientPipeline(input(), noAi);
  // (a) the priority, (b) scored tests under the 30th percentile or "Slightly below" or worse
  assert.deepEqual(rc.areas.map(a => [a.kind, a.title, a.tag]), [
    ['priority', 'Mobility · 48', 'Development priority'],
    ['test', 'Shoulder External Rotation', 'Strength'],
    ['test', 'Single Leg Squat', 'Balance']
  ]);
  assert.match(rc.areas[1].text, /^Your left side is stronger than 22% of people your age and sex\. On court, this affects /);
  for (const a of rc.areas) assert.match(a.text, /(On court|On the pitch|On the field|Day to day), this affects [^.]+\.$/);
  // Shoulder IR has VALD percentiles but isn't in the padel battery: a short chip, not scored.
  assert.equal(rc.testTable.find(r => r.test === 'Shoulder Internal Rotation').chip, 'L 45th · R 42nd pct');
});

test('areas: padel other arm under 60% of the playing arm is shown, not scored', async () => {
  const tests = JSON.parse(JSON.stringify(TESTS));
  const ir = tests.find(t => t.key === 'shoulder_ir');
  ir.sides.left.value = Math.round(ir.sides.right.value * 0.55);
  const { reportContent: rc } = await runClientPipeline(validateClientInput(PROFILE, { sport: 'padel', tests }), noAi);
  const arm = rc.areas.find(a => a.kind === 'other_arm');
  assert.equal(arm.tag, 'Shown, not scored');
  assert.match(arm.text, /^Your other arm produces 55(\.\d)?% of your playing arm's force\. On court, this affects /);
  assert.equal(rc.areas.length, 3);
  assert.equal(rc.areas[0].kind, 'priority');
});

test('areas: nothing beyond the priority qualifies -> "your next gain"', async () => {
  const tests = JSON.parse(JSON.stringify(TESTS)).map(t => ({
    ...t, sides: Object.fromEntries(Object.entries(t.sides).map(([k, x]) => [k, { ...x, ...(x.percentile != null ? { percentile: 70 } : {}), ...(x.band ? { band: 'slightly_above' } : {}) }]))
  }));
  const { reportContent: rc } = await runClientPipeline(validateClientInput(PROFILE, { sport: 'padel', tests }), noAi);
  assert.equal(rc.areas.length, 1);
  assert.equal(rc.areas[0].tag, 'Your next gain');
});

test('REVIEWER_NAME replaces the draft footer; empty keeps it', async () => {
  process.env.REVIEWER_NAME = 'Sara Khan';
  try {
    const { reportContent: rc } = await runClientPipeline(input(), noAi);
    assert.equal(rc.draftNotice, null);
    assert.equal(rc.reviewedNotice, 'Reviewed by Sara Khan, DPT');
  } finally { delete process.env.REVIEWER_NAME; }
  const { reportContent: rc } = await runClientPipeline(input(), noAi);
  assert.equal(rc.draftNotice, 'Draft – pending clinical review');
  assert.equal(rc.reviewedNotice, null);
});

test('tier progress line from the OVR', () => {
  const { tierProgressLine } = require('./machineCard.service');
  assert.equal(tierProgressLine(64), 'Silver at 65. You\'re 1 point away.');
  assert.equal(tierProgressLine(62), 'Silver at 65. You\'re 3 points away.');
  assert.equal(tierProgressLine(65), 'Gold at 75. You\'re 10 points away.');
  assert.equal(tierProgressLine(75), 'Gold tier. Retest to defend it.');
  assert.equal(tierProgressLine(null), null);
});

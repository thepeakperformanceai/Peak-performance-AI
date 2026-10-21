// Run: npm test   (from backend/)
// VALD Hub PDF -> test form -> report. The fixture is the text layout of a
// real two-page VALD Hub export with the athlete's details replaced.

const test = require('node:test');
const assert = require('node:assert/strict');
const { valdPdfForForm } = require('./valdPdfForm');
const { forSport, forCustom } = require('../scoredReport.service');
const { buildCustomConfig } = require('../customAssessment.service');
const { scoreSession } = require('../../scoring/scoring');
const PAGES = require('./fixtures/valdHubPdf.pages.json');

const FILE = { name: 'report.pdf', pages: PAGES };
const PROFILE = { name: 'Test Athlete', dob: '2003-01-01', testDate: '2026-10-21', sex: 'M', position: 'RIGHT', dominantHand: 'R', bodyweight: '70' };
const PROFILE_F = { ...PROFILE, position: 'MID' };
const callModel = async (_s, prompt) => JSON.stringify({ playerProfile: '', summary: '', stats: {}, symmetry: '', recommendation: '', flags: JSON.parse(prompt.slice(prompt.indexOf('{'))).flags.map(() => '') });

test('padel: battery tests filled with VALD percentile/band, never cut-offs; the rest listed and flagged', async () => {
  const out = await valdPdfForForm({ files: [FILE], sport: 'padel' });
  assert.deepEqual(out.athlete, { name: 'Test Athlete', dob: '2003-01-01', testDate: '2026-10-21' });
  assert.deepEqual(Object.keys(out.tests), ['hip_abduction', 'shoulder_er', 'trunk_rotation']);
  assert.ok(Object.values(out.tests).every(t => t.source === 'vald_pdf' && !('cutoffs' in t)));
  assert.equal(out.review.length, 13);
  assert.equal(out.review.filter(r => r.goesTo.kind === 'battery').length, 6);
  const texts = out.problems.map(p => `${p.level}: ${p.text}`);
  for (const t of ['Shoulder Arc of Motion', 'Countermovement Jump', 'Single Leg Squat']) {
    assert.ok(texts.includes(`warn: ${t}: not in our test list, so it is shown on the report but not scored`), t);
  }
  assert.ok(texts.includes('info: Trunk Rotation: VALD gave no percentile or band, so it is measured, not rated'));
  assert.ok(texts.includes('info: Hip Adduction: not in the PDF. Enter it by hand or mark it not done'));
  assert.ok(out.additionalVald.every(r => r.source === 'vald_pdf'));
  assert.equal(out.additionalVald.find(r => r.test === 'Shoulder Internal Rotation').percentile_left, 45);
});

test('unreadable file and a PDF for another athlete are flagged, never filled', async () => {
  const other = JSON.parse(JSON.stringify(PAGES).replace(/"Test A"/g, '"Other A"'));
  const out = await valdPdfForForm({ files: [FILE, { name: 'blank.pdf', pages: [] }, { name: 'other.pdf', pages: other }], sport: 'padel' });
  const errors = out.problems.filter(p => p.level === 'error').map(p => p.text);
  assert.ok(errors.some(e => /^blank\.pdf: no VALD test results found/.test(e)));
  assert.ok(errors.includes('other.pdf is for Other Athlete, not Test Athlete'));
  assert.deepEqual(out.files.map(f => f.ok), [true, false, true]);
  await assert.rejects(() => valdPdfForForm({ files: [{ name: 'blank.pdf', pages: [] }], sport: 'padel' }), /no VALD test results found/);
});

test('padel form from the PDF -> report: percentiles scored, extras worded for the athlete', async () => {
  const padel = forSport('padel');
  const out = await valdPdfForForm({ files: [FILE], sport: 'padel' });
  const { profile, session } = padel.validateInput(PROFILE, { timingMethod: 'electronic', tests: out.tests, additionalVald: out.additionalVald });
  const { reportContent: rc } = await padel.runPipeline(profile, session, { callModel });
  assert.equal(rc.valdFromPdf, true);
  assert.equal(rc.testTable.find(t => t.test === 'Shoulder External Rotation').score, 50.2);
  assert.equal(rc.testTable.find(t => t.test === 'Trunk Rotation').notRated, true);
  assert.deepEqual(rc.additionalVald.map(r => r.test), ['Shoulder Internal Rotation', 'Shoulder Arc of Motion', 'Countermovement Jump', 'Single Leg Squat']);
});

test('custom: every PDF test joins the session; battery tests keep their stat, others shown', async () => {
  const out = await valdPdfForForm({ files: [FILE], sport: 'custom' });
  assert.deepEqual(out.customTests.map(c => [c.key, c.stat]), [
    ['hip_abduction', 'power'], ['shoulder_er', 'power'], ['shoulder_ir', 'power'], ['trunk_rotation', null],
    ['vald_humantrak_shoulderarcofmotion', null], ['vald_humantrak_countermovementjump', null], ['vald_humantrak_singlelegsquat', null]
  ]);
  const { cfg, testInfo, shownOnly } = buildCustomConfig({ testsIn: out.customTests });
  assert.deepEqual(Object.keys(cfg.tests), ['hip_abduction', 'shoulder_er', 'shoulder_ir']);
  assert.equal(shownOnly.length, 4);
  const pipeline = forCustom(cfg, testInfo);
  const { session } = pipeline.validateInput(PROFILE, { tests: out.tests, timingMethod: 'electronic' });
  assert.equal(scoreSession(session, cfg).tests.find(t => t.name === 'shoulder_ir').score, 57.2);   // 45th and 42nd percentile
});

test('by hand: VALD percentile or band per side, or "No band from VALD" (measured, not rated)', () => {
  const football = forSport('football');
  const base = { timingMethod: 'electronic', tests: { hip_extension: { status: 'completed', left: '400', right: '390', percentile_left: '60', percentile_right: '55' } } };
  assert.deepEqual(football.validateInput(PROFILE_F, base).session.tests.hip_extension, { status: 'completed', left: 400, right: 390, percentile_left: 60, percentile_right: 55 });

  const missing = { ...base, tests: { hip_extension: { status: 'completed', left: '400', right: '390', percentile_left: '60' } } };
  assert.throws(() => football.validateInput(PROFILE_F, missing), /band or percentile for each side entered, or choose "No band from VALD"/);

  const none = { ...base, tests: { trunk_rotation: { status: 'completed', left: '84', right: '124', band_left: 'not_rated', band_right: 'not_rated' } } };
  const { session } = football.validateInput(PROFILE_F, none);
  assert.deepEqual(session.tests.trunk_rotation, { status: 'completed', left: 84, right: 124 });
  assert.equal(scoreSession(session).tests.find(t => t.name === 'trunk_rotation').benchmark, 'not_rated');

  assert.throws(() => football.validateInput(PROFILE_F, { ...base, tests: { hip_extension: { ...base.tests.hip_extension, percentile_left: '120' } } }), /percentile must be 0–100/);
});

test('padel athlete report builds from PDF results (percentile sides, unrated trunk rotation)', async () => {
  const padel = forSport('padel');
  const R = require('../padelAthleteReport.service');
  const out = await valdPdfForForm({ files: [FILE], sport: 'padel' });
  const { profile, session } = padel.validateInput(PROFILE, { timingMethod: 'electronic', tests: out.tests });
  const ar = R.buildAthleteReport({ profile, scored: scoreSession(session, padel.cfg), session, cfg: padel.cfg });
  assert.ok(ar);
});

test('client card: every PDF test with the stat it feeds, and the stats this PDF can\'t score', async () => {
  const { valdPdfForClient } = require('./valdPdfForm');
  const out = await valdPdfForClient({ files: [FILE], sport: 'padel' });
  assert.equal(out.tests.length, 7);
  const role = Object.fromEntries(out.review.map(r => [r.master, r.goesTo.label]));
  assert.equal(role['Hip Abduction'], 'Strength and Symmetry');
  assert.equal(role['Shoulder Internal Rotation'], 'Shown as playing arm vs other arm, not scored');
  assert.equal(role['Countermovement Jump'], 'Additional result (shown, not scored)');
  const info = out.problems.filter(p => p.level === 'info').map(p => p.test);
  assert.deepEqual(info, ['Trunk Rotation - Standing', 'Balance', 'Movement']);
  await assert.rejects(() => valdPdfForClient({ files: [FILE], sport: 'tennis' }), /Unknown sport/);
});

// Run: npm test   (from backend/)
// VALD Hub report PDF: what is read from each card, and matching to the
// master VALD test list. The fixture is the text layout of a real two-page
// VALD Hub export (Dynamo + HumanTrak) with the athlete's details replaced.

const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePages, matchToMaster, matchName } = require('./valdHubPdf');
const { valdBattery } = require('../customAssessment.service');
const { ALL_TEST_INFO } = require('../scoredReport.service');
const PAGES = require('./fixtures/valdHubPdf.pages.json');

const MASTER = Object.fromEntries(Object.entries(valdBattery()).map(([k, t]) => [k, { ...ALL_TEST_INFO[k], bilateral: !!t.bilateral }]));

const rows = (tests) => tests.flatMap(t => t.results.map(r => [t.test, t.device, r.side, r.value, r.unit, r.percentile, r.band]));

test('reads every card: test, side, value, percentile or band', () => {
  const { tests } = parsePages(PAGES);
  assert.deepEqual(rows(tests), [
    ['Hip Abduction Supine', 'Dynamo', 'left', 149, 'N', 31, null],
    ['Hip Abduction Supine', 'Dynamo', 'right', 151, 'N', 31, null],
    ['Shoulder External Rotation Sea...', 'Dynamo', 'left', 90, 'N', 22, null],
    ['Shoulder External Rotation Sea...', 'Dynamo', 'right', 117, 'N', 46, null],
    ['Shoulder Internal Rotation Sea...', 'Dynamo', 'left', 147, 'N', 45, null],
    ['Shoulder Internal Rotation Sea...', 'Dynamo', 'right', 143, 'N', 42, null],
    ['Shoulder Arc of Motion', 'HumanTrak', 'left', 142, '°', null, 'Within normal'],
    ['Shoulder Arc of Motion', 'HumanTrak', 'right', 102, '°', null, 'Significantly below'],
    ['Trunk Rotation - Standing', 'HumanTrak', 'left', 84, '°', null, null],
    ['Trunk Rotation - Standing', 'HumanTrak', 'right', 124, '°', null, null],
    ['Countermovement Jump', 'HumanTrak', 'value', 33.2, 'cm', null, 'Slightly below'],
    ['Single Leg Squat', 'HumanTrak', 'left', 75, '°', null, 'Slightly below'],
    ['Single Leg Squat', 'HumanTrak', 'right', 78, '°', null, 'Within normal']
  ]);
  assert.ok(tests.every(t => t.warnings.length === 0));
});

test('reads the metric line, asymmetry and the header', () => {
  const { athlete, tests } = parsePages(PAGES);
  assert.deepEqual(athlete, { name: 'Test Athlete', reportDate: '21 Oct 2026', testDate: null, reportBy: 'Coach Name', age: 23, dob: '1 Jan 2003' });
  const er = tests.find(t => t.test.startsWith('Shoulder External'));
  assert.equal(er.metric, 'Max Force - Left and Right');
  assert.equal(er.truncated, true);
  assert.deepEqual(er.asymmetry, { percent: 23, higher: 'right' });
});

test('two chips for one value are reported, not assigned to a side', () => {
  const pages = JSON.parse(JSON.stringify(PAGES));
  // Add a second chip to the Countermovement Jump card.
  pages[0].items.push({ str: 'Within normal', x: 420, y: 279, w: 50, h: 7 });
  const cmj = parsePages(pages).tests.find(t => t.test === 'Countermovement Jump');
  assert.equal(cmj.results[0].band, null);
  assert.match(cmj.warnings[0], /2 percentile\/band chip\(s\) for 1 result/);
});

test('matches tests to the master list by words, including cut-short names', () => {
  const { tests } = parsePages(PAGES);
  const { matched, unmatched } = matchToMaster(tests, MASTER);
  assert.deepEqual(matched.map(m => [m.test, m.key]), [
    ['Hip Abduction Supine', 'hip_abduction'],
    ['Shoulder External Rotation Sea...', 'shoulder_er'],
    ['Shoulder Internal Rotation Sea...', 'shoulder_ir'],
    ['Trunk Rotation - Standing', 'trunk_rotation']
  ]);
  assert.deepEqual(matched.find(m => m.key === 'trunk_rotation').notes, ['no percentile or band printed for this test']);
  assert.deepEqual(unmatched.map(u => u.test), ['Shoulder Arc of Motion', 'Countermovement Jump', 'Single Leg Squat']);
});

test('name matching: flexible, but never a different test', () => {
  assert.deepEqual(matchName('Shoulder External Rot...'), ['shoulder_er']);
  assert.deepEqual(matchName('Shoulder ER - Prone'), ['shoulder_er']);
  assert.deepEqual(matchName('Hip Adductor Squeeze'), ['hip_adduction']);
  assert.deepEqual(matchName('Knee Extension Seated 90°'), ['knee_extension']);
  assert.deepEqual(matchName('Single Leg Stand - Eyes Closed'), ['single_leg_stand']);
  assert.deepEqual(matchName('Overhead Squat'), ['overhead_squat']);
  assert.deepEqual(matchName('Single Leg Squat'), []);
  assert.deepEqual(matchName('Knee Flexion'), []);
  assert.deepEqual(matchName('Hip Flexion'), []);
});

test('PDF -> padel form: percentiles and bands from VALD, never cut-offs; the rest shown, not scored', () => {
  const { pdfToResults } = require('./valdHubPdf');
  const { loadConfig } = require('../../scoring/scoring');
  const r = pdfToResults(parsePages(PAGES), loadConfig('padel').tests, MASTER);
  assert.deepEqual(r.tests, {
    hip_abduction: { status: 'completed', source: 'vald_pdf', left: 149, percentile_left: 31, right: 151, percentile_right: 31 },
    shoulder_er: { status: 'completed', source: 'vald_pdf', left: 90, percentile_left: 22, right: 117, percentile_right: 46 },
    trunk_rotation: { status: 'completed', source: 'vald_pdf', left: 84, right: 124 }
  });
  assert.ok(Object.values(r.tests).every(t => !('cutoffs' in t)));
  assert.deepEqual(r.additionalVald.map(a => a.test), ['Shoulder Internal Rotation', 'Shoulder Arc of Motion', 'Countermovement Jump', 'Single Leg Squat']);
  assert.deepEqual(r.additionalVald[1], { test: 'Shoulder Arc of Motion', device: 'HumanTrak', unit: '°', date: '2026-10-21', stat: null, left: 142, band_left: 'within_normal', right: 102, band_right: 'well_below' });
});

test('VALD band wording pairs with the engine bands in order', () => {
  const { VALD_BAND_LABEL } = require('./valdHubPdf');
  const { loadConfig } = require('../../scoring/scoring');
  assert.deepEqual(Object.values(VALD_BAND_LABEL), loadConfig('football').vald_band_labels);
  assert.deepEqual(Object.keys(VALD_BAND_LABEL), ['Significantly below', 'Slightly below', 'Within normal', 'Slightly above', 'Significantly above']);
});

test('report from the PDF: percentiles in plain words, VALD band words, not rated, cut-offs refused', async () => {
  const { pdfToResults } = require('./valdHubPdf');
  const { forSport } = require('../scoredReport.service');
  const padel = forSport('padel');
  const r = pdfToResults(parsePages(PAGES), padel.cfg.tests, MASTER);
  const profile = { name: 'Test Athlete', dob: '2003-01-01', testDate: '2026-10-21', sex: 'M', position: 'RIGHT', dominantHand: 'R', bodyweight: '70' };
  const { profile: p, session } = padel.validateInput(profile, { timingMethod: 'electronic', tests: r.tests, additionalVald: r.additionalVald });

  const withCuts = { ...r.tests, hip_abduction: { ...r.tests.hip_abduction, cutoffs: [100, 180, 260, 340] } };
  assert.throws(() => padel.validateInput(profile, { timingMethod: 'electronic', tests: withCuts }), /read from the VALD PDF, so cut-offs are not used/);

  const callModel = async () => JSON.stringify({ playerProfile: '', summary: '', stats: {}, symmetry: '', recommendation: '', flags: [] });
  const { reportContent: rc, payload } = await padel.runPipeline(p, session, { callModel });
  const er = rc.valdNorms.find(n => n.test === 'Shoulder External Rotation');
  assert.equal(er.cardScore, 50.2);
  assert.deepEqual(er.sides.map(s => [s.side, s.result, s.percentileLabel, s.percentileText]), [
    ['Left', '90 N', '22nd percentile', 'Stronger than 22% of people your age and sex'],
    ['Right', '117 N', '46th percentile', 'Stronger than 46% of people your age and sex']
  ]);
  const trunk = rc.valdNorms.find(n => n.test === 'Trunk Rotation');
  assert.equal(trunk.notRated, true);
  assert.deepEqual(trunk.sides.map(s => s.result), ['84°', '124°']);
  assert.equal(rc.testTable.find(t => t.test === 'Trunk Rotation').notRated, true);
  assert.equal(rc.additionalVald.find(a => a.test === 'Shoulder Internal Rotation').percentile_left, 45);
  const pt = payload.tests.find(t => t.name === 'Shoulder External Rotation');
  assert.equal(pt.vald_percentile_left, 22);
  assert.equal(pt.vald_percentile_right, 46);
  assert.equal(payload.tests.find(t => t.name === 'Trunk Rotation').benchmark, 'not_rated');
});

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
  assert.deepEqual(athlete, { name: 'Test Athlete', reportDate: '21 Oct 2026', reportBy: 'Coach Name', age: 23, dob: '1 Jan 2003' });
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

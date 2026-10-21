// Run: npm test   (from backend/)
// Client card stats from VALD machine tests (machine_card_v1.json).

const test = require('node:test');
const assert = require('node:assert/strict');
const { scoreMachineCard, loadMachineConfig } = require('./machineCard');
const { loadConfig } = require('./scoring');
const { parsePages } = require('../services/vald/valdHubPdf');
const { machineTestsFromPdf, buildMachineReport } = require('../services/machineCard.service');
const PAGES = require('../services/vald/fixtures/valdHubPdf.pages.json');

const TESTS = machineTestsFromPdf(parsePages(PAGES));
const PROFILE = { name: 'Test Athlete', age: 23, position: 'RIGHT', dominantHand: 'R', testDate: '2026-10-21' };

test('padel from the sample PDF: strength, symmetry, balance from Single Leg Squat, mobility from rated tests', () => {
  const c = scoreMachineCard(TESTS, loadConfig('padel').tests);
  assert.equal(c.stats.strength.value, 49);              // percentiles 31,31,22,46 -> 32.5 -> 49.05
  assert.equal(c.stats.strength.averagePercentile, 32.5);
  assert.equal(c.stats.symmetry.value, 95);              // lower body only: Hip Abduction LSI 98.7 -> 95.2
  assert.deepEqual(c.stats.symmetry.from.map(f => f.test), ['Hip Abduction']);
  assert.equal(c.stats.balance.value, 56);               // Single Leg Squat: Slightly below 48, Within normal 63 -> 55.5
  assert.equal(c.stats.movement.value, null);            // no Overhead Squat
  assert.equal(c.stats.mobility.value, 48);              // Arc of Motion: Within normal 63, Significantly below 33
  assert.deepEqual(c.stats.mobility.from.map(f => [f.test, f.score]), [['Shoulder Arc of Motion', 48]]);
  assert.deepEqual(c.stats.mobility.measuredNotRated, []);   // Trunk Rotation is never a mobility test
  assert.equal(c.ovr.value, 62);                         // (49 + 95 + 56 + 48) / 4
  assert.deepEqual(c.locked, { speed: { value: null, status: 'locked', text: 'Unlocks with Performance add-on' } });
});

test('Single Leg Stand and Trunk Rotation are never scored; fewer than 3 scored stats means rating pending', () => {
  const fewer = TESTS.filter(t => !['single_leg_squat', 'arc_of_motion'].includes(t.key));   // strength + symmetry only
  const c = scoreMachineCard(fewer, loadConfig('padel').tests);
  assert.equal(c.stats.balance.value, null);
  assert.equal(c.ovr.value, null);
  assert.equal(c.ovr.message, 'Rating pending: 2 of 5 stats scored (needs 3)');
});

test('only the sport battery\'s Dynamo tests feed Strength and Symmetry', () => {
  const football = scoreMachineCard(TESTS, loadConfig('football').tests, { useProposed: true });
  assert.equal(football.stats.strength.value, null);     // no hip / knee extension in the PDF
  assert.equal(football.stats.symmetry.value, null);
  const cricket = scoreMachineCard(TESTS, loadConfig('cricket').tests, { useProposed: true });
  assert.equal(cricket.stats.strength.value, 54);         // ER 22,46 + IR 45,42 -> 38.75
});

test('the locked Speed slot is never a stat and never counts towards Unrated', () => {
  const mcfg = loadMachineConfig();
  assert.deepEqual(mcfg.stats, ['strength', 'symmetry', 'balance', 'movement', 'mobility']);
  assert.ok(!mcfg.stats.includes('speed'));
  const { reportContent } = buildMachineReport({ tests: TESTS, sport: 'padel', profile: PROFILE, useProposed: true });
  assert.deepEqual(reportContent.ovrScores.map(s => [s.name, s.score]), [
    ['Strength', 49], ['Symmetry', 95], ['Balance', 56], ['Movement', null], ['Mobility', 48], ['Speed', null]
  ]);
  assert.equal(reportContent.ovrScores[5].status, 'locked');
  assert.equal(reportContent.ovrScores[1].status, undefined);   // shown and scored
  assert.equal(reportContent.statSet, 'machine_v1');
  assert.equal(reportContent.testTable.find(t => t.test === 'Trunk Rotation').notRated, true);
});

test('General / Gym: Shoulder ER, Hip Abduction and Knee Extension feed Strength and Symmetry', () => {
  const { generalBattery } = require('./machineCard');
  assert.deepEqual(Object.keys(generalBattery()), ['shoulder_er', 'hip_abduction', 'knee_extension']);
  const c = scoreMachineCard(TESTS, generalBattery(), { useProposed: true });
  assert.equal(c.stats.strength.value, 49);              // ER 22,46 + Hip Abd 31,31 (no knee extension in the PDF)
  assert.equal(c.stats.symmetry.value, 95);              // Hip Abduction (no knee extension in the PDF)
  const { reportContent } = buildMachineReport({ tests: TESTS, sport: 'general', profile: { ...PROFILE, position: '' } });
  assert.equal(reportContent.sport, 'General / Gym');
  assert.equal(reportContent.sportKey, 'general');
  assert.equal(reportContent.overallOVR, 62);            // strength 49, symmetry 95, balance 56, mobility 48
});

test('"What it means for <sport>": fixed library lines for every sport and stat, no numbers', () => {
  const lines = require('../library/client_card_sport_lines.json').sports;
  for (const sport of ['football', 'padel', 'cricket', 'general']) {
    for (const k of ['strength', 'symmetry', 'balance', 'movement', 'mobility', 'speed']) {
      assert.ok(lines[sport][k], `${sport} ${k}`);
      assert.doesNotMatch(lines[sport][k], /\d/, `${sport} ${k} has a number`);
    }
  }
  const { reportContent } = buildMachineReport({ tests: TESTS, sport: 'padel', profile: PROFILE });
  const by = Object.fromEntries(reportContent.fieldMeaning.stats.map(s => [s.key, s.sportLine]));
  assert.deepEqual(by.strength, { sport: 'padel', text: lines.padel.strength });
  assert.deepEqual(by.symmetry, { sport: 'padel', text: lines.padel.symmetry });
  assert.deepEqual(by.speed, { sport: 'padel', text: lines.padel.speed });
});

// Second real layout (Hip Adduction/Abduction, Shoulder ER, Single Leg Stand
// in mm², Trunk Flexion/Extension, Overhead Squat, Trunk Rotation), details replaced.
test('second VALD PDF: mm² read, mobility from rated trunk tests, never-scored tests measured · not rated, whole numbers', () => {
  const { steadierLeg } = require('../services/machineCard.service');
  const tests2 = machineTestsFromPdf(parsePages(require('../services/vald/fixtures/valdHubPdf2.pages.json')));
  const stand = tests2.find(t => t.key === 'single_leg_stand');
  assert.deepEqual([stand.sides.left.value, stand.sides.right.value, stand.unit], [24194, 7745, 'mm²']);
  assert.deepEqual(steadierLeg(stand), { leg: 'right', basis: 'lower sway' });

  const { card, reportContent: rc, coachText } = buildMachineReport({ tests: tests2, sport: 'padel', profile: { ...PROFILE, position: 'LEFT' } });
  assert.deepEqual(Object.fromEntries(Object.entries(card.stats).map(([k, v]) => [k, v.value])),
    { strength: 69, symmetry: 55, balance: null, movement: 85, mobility: 56 });
  assert.deepEqual(card.stats.symmetry.from.map(f => [f.test, f.lsi, f.score]), [['Hip Adduction', 69.3, 25], ['Hip Abduction', 94.9, 84.2]]);
  assert.equal(card.ovr.value, 66);                                     // (69 + 55 + 85 + 56) / 4
  assert.deepEqual(rc.flags.map(f => [f.level, f.test, f.value]), [['red', 'Hip Adduction', 69.3]]);
  assert.deepEqual(rc.testTable.map(r => [r.test, r.score, r.stat || (r.notRated ? 'not rated' : r.chip)]), [
    ['Hip Adduction', 48, 'Strength · Symmetry'], ['Hip Abduction', 81, 'Strength · Symmetry'], ['Shoulder External Rotation', 77, 'Strength'],
    ['Single Leg Stand (Eyes Closed)', null, 'not rated'], ['Trunk Flexion', 48, 'Mobility'], ['Trunk Extension', 63, 'Mobility'],
    ['Overhead Squat', 85, 'Movement'], ['Trunk Rotation', null, 'not rated']
  ]);
  assert.ok(rc.testTable.every(r => r.score === null || Number.isInteger(r.score)));
  assert.equal(rc.position, '');                                         // never in the OVERALL area
  assert.deepEqual(rc.positionChip, { label: 'SIDE', value: 'Left' });
  assert.match(coachText.stats.balance, /Single Leg Stand \(eyes closed\) was measured: left 24194 mm², right 7745 mm²\. Your right leg was steadier \(lower sway\)\./);
  assert.equal(rc.additionalVald.length, 0);                            // every test is in All Tests
});

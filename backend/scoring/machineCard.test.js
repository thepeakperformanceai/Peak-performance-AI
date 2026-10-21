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

test('padel from the sample PDF: strength, proposed symmetry, mobility from Arc of Motion', () => {
  const c = scoreMachineCard(TESTS, loadConfig('padel').tests, { useProposed: true });
  assert.equal(c.stats.strength.value, 49);              // percentiles 31,31,22,46 -> 32.5 -> 49.05
  assert.equal(c.stats.strength.averagePercentile, 32.5);
  assert.equal(c.stats.symmetry.value, 95);              // lower body only: Hip Abd LSI 98.7 -> 95.2 (shoulder ER not scored)
  assert.deepEqual(c.stats.symmetry.from.map(f => f.test), ['Hip Abduction']);
  assert.equal(c.stats.symmetry.proposed, true);
  assert.equal(c.stats.balance.value, null);             // no Single Leg Stand in the PDF
  assert.equal(c.stats.movement.value, null);            // no Overhead Squat
  assert.equal(c.stats.mobility.value, 48);              // Within normal 63, Significantly below 33
  assert.deepEqual(c.stats.mobility.from.map(f => f.test), ['Shoulder Arc of Motion', 'Shoulder Arc of Motion']);
  assert.equal(c.ovr.value, 64);                         // (49 + 95 + 48) / 3
  assert.deepEqual(c.locked, { speed: { value: null, status: 'locked', text: 'Unlocks with Performance add-on' } });
});

test('a proposed stat is never counted unless allowed: Unrated with fewer than 3 of 5', () => {
  const c = scoreMachineCard(TESTS, loadConfig('padel').tests);
  assert.equal(c.stats.symmetry.value, 95);
  assert.equal(c.ovr.value, null);
  assert.equal(c.ovr.message, 'Rating pending: 2 of 5 stats scored (needs 3)');
  assert.ok(c.ovr.reasons.includes('symmetry: proposed, not counted'));
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
    ['Strength', 49], ['Symmetry', 95], ['Balance', null], ['Movement', null], ['Mobility', 48], ['Speed', null]
  ]);
  assert.equal(reportContent.ovrScores[5].status, 'locked');
  assert.equal(reportContent.statSet, 'machine_v1');
  assert.equal(reportContent.testTable.find(t => t.test === 'Trunk Rotation').notRated, true);
});

test('General / Gym: Shoulder ER, Hip Abduction and Knee Extension feed Strength and Symmetry', () => {
  const { generalBattery } = require('./machineCard');
  assert.deepEqual(Object.keys(generalBattery()), ['shoulder_er', 'hip_abduction', 'knee_extension']);
  const c = scoreMachineCard(TESTS, generalBattery(), { useProposed: true });
  assert.equal(c.stats.strength.value, 49);              // ER 22,46 + Hip Abd 31,31 (no knee extension in the PDF)
  assert.equal(c.stats.symmetry.value, 95);
  const { reportContent } = buildMachineReport({ tests: TESTS, sport: 'general', profile: { ...PROFILE, position: '' } });
  assert.equal(reportContent.sport, 'General / Gym');
  assert.equal(reportContent.sportKey, 'general');
  assert.equal(reportContent.overallOVR, null);          // symmetry not counted yet -> rating pending
  assert.equal(reportContent.ovrMessage, 'Rating pending: 2 of 5 stats scored (needs 3)');
});

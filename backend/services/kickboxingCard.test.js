// Kickboxing client card (K7): its battery feeds all five stats.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildMachineReport, SPORTS } = require('./machineCard.service');
const { clientMethodology } = require('./clientMethodology.service');

const T = (key, label, device, unit, sides) => ({ key, label, device, unit, sides });

test('kickboxing is a client card sport with its own page', () => {
  assert.ok(SPORTS.includes('kickboxing'));
  const m = clientMethodology('client-kickboxing');
  const tests = Object.fromEntries(m.stats.map(s => [s.key, s.tests || []]));
  assert.deepEqual(tests.strength, ['Shoulder External Rotation', 'Shoulder Internal Rotation', 'Hip Abduction', 'Hip Adduction']);
  assert.deepEqual(tests.symmetry, ['Hip Abduction', 'Hip Adduction']);
  assert.deepEqual(tests.mobility, ['Shoulder Arc of Motion', 'Weight Bearing Dorsiflexion']);
});

test('the full K7 battery scores all five stats', () => {
  const tests = [
    T('shoulder_er', 'Shoulder External Rotation', 'Dynamo', 'N', { left: { value: 80, percentile: 14 }, right: { value: 76, percentile: 12 } }),
    T('hip_abduction', 'Hip Abduction', 'Dynamo', 'N', { left: { value: 200, percentile: 40 }, right: { value: 180, percentile: 30 } }),
    T('hip_adduction', 'Hip Adduction', 'Dynamo', 'N', { left: { value: 190 }, right: { value: 200 } }),
    T('single_leg_squat', 'Single Leg Squat', 'HumanTrak', '°', { left: { value: 75, band: 'within_normal' }, right: { value: 78, band: 'within_normal' } }),
    T('overhead_squat', 'Overhead Squat', 'HumanTrak', '°', { left: { value: 135, band: 'within_normal' }, right: { value: 138, band: 'within_normal' } }),
    T('arc_of_motion', 'Shoulder Arc of Motion', 'HumanTrak', '°', { left: { value: 142, band: 'within_normal' }, right: { value: 130, band: 'below' } })
  ];
  const { card, reportContent } = buildMachineReport({ tests, sport: 'kickboxing', profile: { name: 'Sample', age: 30, testDate: '2026-11-26' } });
  for (const k of ['strength', 'symmetry', 'balance', 'movement', 'mobility']) assert.notEqual(card.stats[k].value, null, k);
  assert.notEqual(card.ovr.value, null);
  assert.equal(reportContent.sport, 'Kickboxing');
});

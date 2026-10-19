// Run: npm test   (from backend/)
// Cricket athlete report: same engine and format as padel, driven by
// library/cricket.json (built from docs/library/cricket.md). The library
// matches the .md and the cricket battery, every "Why" line is filled from
// the engine's numbers, and the report never names a device.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadConfig, scoreSession } = require('../scoring/scoring');
const R = require('./padelAthleteReport.service');

const cfg = loadConfig('cricket');
const C = R.forSport('cricket');
const LIB = C.LIBRARY;

const PROFILE = { name: 'Bilal Hussain', position: 'BAT', testDate: '2026-10-19' };
const SESSION = {
  athlete: { age: 15, sex: 'M', position: 'BAT', dominant_hand: 'R' },
  timing_method: 'electronic',
  tests: {
    sprint_10m: { status: 'completed', value: 1.92 },
    sprint_20m: { status: 'completed', value: 3.28 },
    cod_505: { status: 'completed', value: 2.58 },
    ruler_drop: { status: 'completed', value: 16 },
    single_leg_stand: { status: 'completed', left: 14, right: 16, cutoffs: [3, 8, 15, 25] },
    shoulder_er: { status: 'completed', left: 150, right: 140, cutoffs: [60, 100, 150, 220] },
    hip_extension: { status: 'completed', left: 360, right: 345, cutoffs: [150, 250, 350, 450] }
  }
};
const build = (session = SESSION) => C.buildAthleteReport({ profile: PROFILE, scored: scoreSession(session, cfg), session, cfg });

test('cricket library: one entry per cricket battery test, built from docs/library/cricket.md', () => {
  const { buildCricketLibrary } = require('../library/buildCricketLibrary');
  const raw = fs.readFileSync(path.join(__dirname, '../../docs/library/cricket.md'), 'utf8');
  assert.deepEqual(buildCricketLibrary(raw, { draft_notice: LIB.draft_notice }), LIB);
  assert.deepEqual(LIB.tests.map(t => t.key).sort(), Object.keys(cfg.tests).sort());
});

test('cricket report: same parts as padel, ranked by points below Gold, every Why line filled', () => {
  const ar = build();
  assert.deepEqual(ar.weapons.map(w => w.key), ['cod_505', 'hip_extension']);
  assert.deepEqual(ar.priorities.map(p => [p.key, p.gapToTarget]), [['sprint_20m', 9], ['shoulder_er', 7], ['single_leg_stand', 5]]);
  assert.equal(ar.priorities[0].why[0], 'You covered 20 metres in 3.28 seconds. Gold starts at 3.21 seconds, so you\'re 0.07 seconds away.');
  // Throwing arm (dominant hand R): the right side's own score.
  assert.equal(ar.priorities[1].why[0], 'Your throwing arm scored 67. Gold starts at 75, so you\'re 8 points away.');
  for (const p of ar.priorities) {
    assert.ok(p.nickname && p.notice.startsWith("You'll notice it when") && p.fixIt.startsWith('Fix it and'), p.key);
    assert.ok(p.why.every(l => !/\{\w+\}/.test(l)), p.key);
  }
  assert.equal(ar.fullResults.length, 7);
  assert.equal(ar.drillsLabel, 'Pitch drills');
  assert.equal(ar.libraryVersion, 'cricket-library-v1.0');
  assert.equal(R.DEVICE_WORDS.test(JSON.stringify({ w: ar.weapons, p: ar.priorities, f: ar.fullResults })), false);
});

test('cricket report: a test without an agreed benchmark (medicine ball) is never shown', () => {
  const s = structuredClone(SESSION);
  s.tests.medicine_ball = { status: 'completed', value: 5.2 };
  const ar = build(s);
  assert.equal(ar.fullResults.some(r => r.key === 'medicine_ball'), false);
  assert.equal(ar.priorities.some(p => p.key === 'medicine_ball'), false);
});

test('padel keeps its own library and wording; Gemini is told the right sport', () => {
  assert.equal(R.LIBRARY.sport, 'padel');
  assert.match(R.SYSTEM_PROMPT, /You are a padel coach/);
  assert.match(C.SYSTEM_PROMPT, /You are a cricket coach/);
  assert.equal(R.forSport('football'), null);
});

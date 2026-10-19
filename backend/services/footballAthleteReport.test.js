// Run: npm test   (from backend/)
// Football athlete report: same engine and format as padel and cricket,
// driven by library/football.json (built from docs/library/football.md).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadConfig, scoreSession } = require('../scoring/scoring');
const R = require('./padelAthleteReport.service');

const cfg = loadConfig('football');
const F = R.forSport('football');
const LIB = F.LIBRARY;

const PROFILE = { name: 'Usman Tariq', position: 'MID', testDate: '2026-10-19' };
const SESSION = {
  athlete: { age: 17, sex: 'M', position: 'MID', dominant_hand: 'R' },
  timing_method: 'electronic',
  observations: { overhead_squat_fault: 'heels_lift' },
  tests: {
    sprint_10m: { status: 'completed', value: 1.9 },
    sprint_30m: { status: 'completed', value: 4.4 },
    cod_505: { status: 'completed', left: 2.70, right: 2.56 },
    ruler_drop: { status: 'completed', value: 15 },
    single_leg_stand: { status: 'completed', left: 18, right: 21, cutoffs: [3, 8, 15, 25] },
    trunk_rotation: { status: 'completed', left: 44, right: 47, cutoffs: [20, 30, 40, 55] },
    overhead_squat: { status: 'completed', value: 50, cutoffs: [30, 50, 65, 80] },
    hip_extension: { status: 'completed', left: 420, right: 400, cutoffs: [150, 250, 350, 450] },
    knee_extension: { status: 'completed', left: 520, right: 505, cutoffs: [200, 300, 450, 600] }
  }
};
const build = (session = SESSION) => F.buildAthleteReport({ profile: PROFILE, scored: scoreSession(session, cfg), session, cfg });

test('football library: one entry per football battery test, built from docs/library/football.md', () => {
  const { buildFootballLibrary } = require('../library/buildFootballLibrary');
  const raw = fs.readFileSync(path.join(__dirname, '../../docs/library/football.md'), 'utf8');
  assert.deepEqual(buildFootballLibrary(raw, { draft_notice: LIB.draft_notice }), LIB);
  assert.deepEqual(LIB.tests.map(t => t.key).sort(), Object.keys(cfg.tests).sort());
});

test('football report: same parts as padel, every Why line filled, no device names', () => {
  const ar = build();
  assert.equal(ar.priorities.length, 3);
  for (const p of ar.priorities) {
    assert.ok(p.nickname && p.notice.startsWith("You'll notice it when") && p.fixIt.startsWith('Fix it and'), p.key);
    assert.ok(p.why.every(l => !/\{\w+\}/.test(l)), p.key);
  }
  // The squat fault picked on the form chooses the fix.
  const ohs = ar.priorities.find(p => p.key === 'overhead_squat');
  assert.ok(ohs, 'overhead squat is a priority in this session');
  assert.deepEqual(ohs.fixes.map(f => f.key), ['A']);
  assert.match(ohs.why[0], /heels lifted off the floor/);
  assert.equal(ar.fullResults.length, 9);
  assert.equal(ar.drillsLabel, 'Pitch drills');
  assert.equal(R.DEVICE_WORDS.test(JSON.stringify({ w: ar.weapons, p: ar.priorities, f: ar.fullResults })), false);
});

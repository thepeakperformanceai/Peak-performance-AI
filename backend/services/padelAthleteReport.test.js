// Run: npm test   (from backend/)
// Padel athlete report (the separate PDF): the library matches
// docs/library/padel.md, scores are read from the existing engine unchanged,
// side filtering, ranking by score points below 75, the library's left/right
// and ratio rules, the 6-week plan, retest date, next-tier gaps and the
// Gemini guardrails.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadConfig, scoreSession } = require('../scoring/scoring');
const { SPORT_PROFILES } = require('./scoredReport.service');
const R = require('./padelAthleteReport.service');

const cfg = loadConfig('padel');
const LIB = R.LIBRARY;
const MD = fs.readFileSync(path.join(__dirname, '../../docs/library/padel.md'), 'utf8').replace(/\*\*/g, '');
const CARD_TIERS = require('../scoring/card_tiers.json');

const PROFILE = { name: 'Ali Khan', position: 'RIGHT', testDate: '2026-10-18' };
// Engine scores: sprint 60.8, 5-0-5 74.6 (faster foot 2.55 s), ruler 82, SLS 68.1, trunk 73.5, OHS 60,
// shoulder 69.6, hip abd 76.6, hip add 63.4.
const SESSION = {
  athlete: { age: 24, sex: 'M', position: 'RIGHT', dominant_hand: 'R' },
  timing_method: 'electronic',
  observations: { overhead_squat_fault: 'arms_drop' },
  tests: {
    sprint_10m: { status: 'completed', value: 2.05 },
    ruler_drop: { status: 'completed', value: 12.0 },
    cod_505: { status: 'completed', left: 2.62, right: 2.55 },
    single_leg_stand: { status: 'completed', left: 9, right: 21, cutoffs: [3, 8, 15, 25] },
    trunk_rotation: { status: 'completed', left: 38, right: 50, cutoffs: [20, 30, 40, 55] },
    overhead_squat: { status: 'completed', value: 55, cutoffs: [30, 50, 65, 80] },
    shoulder_er: { status: 'completed', left: 160, right: 140, cutoffs: [60, 100, 150, 220] },
    hip_abduction: { status: 'completed', left: 300, right: 290, cutoffs: [100, 180, 260, 340] },
    hip_adduction: { status: 'completed', left: 200, right: 250, cutoffs: [100, 180, 260, 340] }
  }
};
const STRONG_HIPS = { status: 'completed', left: 330, right: 330, cutoffs: [100, 180, 260, 340] };

const copy = (o) => structuredClone(o);
const build = (session = SESSION, profile = PROFILE) =>
  R.buildAthleteReport({ profile, scored: scoreSession(session, cfg), session, cfg });

// ---------- library ----------

test('library: one entry per test in docs/library/padel.md, in its order', () => {
  assert.deepEqual(LIB.tests.map(t => t.name), ['10m Sprint', '5-0-5 Agility Test', 'Ruler Drop Test', 'Overhead Squat',
    'Trunk Rotation', 'Single Leg Stand, Eyes Closed', 'Shoulder External Rotation Strength', 'Hip Abduction Strength', 'Hip Adduction Strength']);
  // The library and the padel scoring battery cover exactly the same 9 tests (5-0-5 in, Beep Test out).
  assert.deepEqual(LIB.tests.map(t => t.key).sort(), Object.keys(cfg.tests).sort());
});

test('library: padel.json is exactly what docs/library/padel.md builds (run scripts/build-padel-library.js after editing)', () => {
  const { buildPadelLibrary } = require('../library/buildPadelLibrary');
  const raw = fs.readFileSync(path.join(__dirname, '../../docs/library/padel.md'), 'utf8');
  assert.deepEqual(buildPadelLibrary(raw, { draft_notice: LIB.draft_notice }), LIB);
});

test('library: every nickname, notice, Why, Fix it, rule, exercise and court drill is word for word from padel.md', () => {
  for (const t of LIB.tests) {
    const texts = [t.what_we_measured, t.nickname, t.notice, t.fix_it, ...t.why.map(w => w.text), ...t.court_drills,
      ...Object.values(t.fixes).flatMap(f => f.exercises), ...t.rules.map(r => r.text)];
    if (t.retest_note) texts.push(t.retest_note);
    for (const x of texts) assert.ok(MD.includes(x), `${t.key}: not in padel.md: ${x}`);
    for (const [k, f] of Object.entries(t.fixes)) assert.ok(MD.includes(`Fix ${k}: ${f.title}`), `${t.key} Fix ${k}`);
    assert.ok(MD.includes(`Retest: ${t.retest_weeks} weeks`), `${t.key} retest`);
  }
});

test('library: placeholders are only the ten the engine fills', () => {
  const used = new Set(LIB.tests.flatMap(t => t.why.flatMap(w => (w.text.match(/\{(\w+)\}/g) || []))));
  assert.deepEqual([...used].sort(), ['{distance}', '{fault}', '{gap}', '{next_tier}', '{ratio}', '{score}', '{seconds}', '{target}', '{time}', '{weaker_side}']);
});

test('library: rules point at fixes that exist; every test has its four athlete parts and court drills', () => {
  for (const t of LIB.tests) {
    for (const r of t.rules) assert.ok(t.fixes[r.fix], `${t.key} rule -> Fix ${r.fix}`);
    if (t.maintain_fix) assert.equal(t.fixes[t.maintain_fix].kind, 'maintain', t.key);
    assert.ok(t.nickname && t.notice && t.fix_it && t.why.length && t.court_drills.length, t.key);
    for (const w of t.why) assert.ok(w.when && w.when.type, `${t.key} ${w.label}`);
  }
});

test('library: no playing side anywhere; tiers and target match the card tiers', () => {
  const text = JSON.stringify(LIB);
  assert.equal(LIB.sides, undefined);
  for (const word of ['role_lines', 'role_drills', 'Every player', '"drive"', '"reves"']) assert.equal(text.includes(word), false, word);
  assert.deepEqual(LIB.tiers.map(t => [t.key, t.min_score]), CARD_TIERS.tiers.map(t => [t.key, t.min_ovr]));
  assert.equal(LIB.target.score, 75);
  assert.equal(LIB.rebuild, undefined);
  assert.equal(text.includes('REBUILD_URL'), false);
});

// ---------- scores come from the engine, unchanged ----------

test('scores: every score is the engine\'s own number, rounded to a whole number exactly as the OVR card rounds', () => {
  const { pyRound } = require('../scoring/scoring');
  const scored = scoreSession(SESSION, cfg);
  const ar = R.buildAthleteReport({ profile: PROFILE, scored, session: SESSION, cfg });
  for (const x of [...ar.weapons, ...ar.priorities]) {
    assert.equal(x.score, pyRound(scored.tests.find(t => t.name === x.key).score), x.key);
    assert.ok(Number.isInteger(x.score), x.key);
  }
  assert.equal(pyRound(73.5), 74);                                    // same tie rule as the card (73.5 -> 74, 72.5 -> 72)
  assert.equal(pyRound(72.5), 72);
  assert.deepEqual(scoreSession(SESSION, cfg), scored);                 // building the report changes nothing
});

// ---------- playing side ----------

test('playing side is ignored: Drive, Revés and Both get the same report', () => {
  const view = (position) => { const ar = build(SESSION, { ...PROFILE, position }); return JSON.stringify(ar); };
  assert.equal(view('LEFT'), view('RIGHT'));
  assert.equal(view('BOTH'), view('RIGHT'));
  assert.equal(view(undefined), view('RIGHT'));
});

const priority = (ar, key) => ar.priorities.find(p => p.key === key);
// Strong everywhere except the tests a case wants ranked.
const base = () => {
  const s = copy(SESSION);
  s.tests.sprint_10m.value = 1.80;
  s.tests.overhead_squat.value = 80;
  s.tests.hip_adduction = STRONG_HIPS;
  s.tests.hip_abduction = STRONG_HIPS;
  return s;
};

// ---------- weapons and ranking ----------

test('weapons: the two best scores, led by what they mean on court, then one plain number', () => {
  const ar = build();
  assert.deepEqual(ar.weapons.map(w => [w.key, w.score, w.tier]), [['ruler_drop', 82, 'Gold'], ['hip_abduction', 77, 'Gold']]);
  assert.deepEqual(ar.weapons.map(w => w.headline), ['Fast hands at the net', 'Fast first step to the middle']);
  assert.deepEqual(ar.weapons.map(w => w.number), [{ value: '12 cm', isScore: false }, { value: '77', isScore: true }]);
  // Hip abduction 300 / 290: about 3% apart.
  assert.equal(ar.weapons[1].body, 'your outer hips are strong and almost even, left vs right');
  assert.equal(ar.weapons[1].nickname, 'Outer-hip strength: your sideways push');
  assert.equal(ar.weapons[1].line, undefined);                        // no role lines any more
});

test('weapons: evenness in the test\'s own words', () => {
  const s = copy(SESSION);
  s.tests.ruler_drop.value = 28;
  s.tests.hip_abduction = { status: 'completed', left: 330, right: 280, cutoffs: [100, 180, 260, 340] };   // 15% apart
  s.tests.single_leg_stand = { status: 'completed', left: 24, right: 28, cutoffs: [3, 8, 15, 25] };       // 14% apart
  const bodies = Object.fromEntries(build(s).weapons.map(w => [w.key, w.body]));
  assert.equal(bodies.hip_abduction, 'your outer hips are strong and stronger on your left side by 15%');
  assert.equal(bodies.single_leg_stand, 'you stay steady on one leg with your eyes closed, steadier on your right leg by 14%');
});

test('priorities: biggest gap in score points below 75 first, top 3, weapons excluded', () => {
  const ar = build();
  assert.deepEqual(ar.priorities.map(p => [p.key, p.gapToTarget]), [['overhead_squat', 15], ['sprint_10m', 14], ['hip_adduction', 12]]);
  assert.ok(ar.priorities.every(p => !ar.weapons.some(w => w.key === p.key)));
});

test('priorities: ties keep library order; only tests below 75 are ranked', () => {
  const s = copy(SESSION);
  s.tests.sprint_10m.value = 2.10;                                   // 55
  s.tests.ruler_drop.value = 20.4;                                    // 55 (library order: sprint first)
  s.tests.hip_adduction = STRONG_HIPS;
  s.tests.overhead_squat.value = 80;
  const ar = build(s);
  assert.deepEqual(ar.priorities.slice(0, 2).map(p => p.key), ['sprint_10m', 'ruler_drop']);
  for (const p of ar.priorities) assert.ok(p.score < 75);
});

test('priorities: fewer than 3 when fewer tests are below 75; missing tests are never ranked or estimated', () => {
  const s = { ...copy(SESSION), tests: {
    sprint_10m: { status: 'completed', value: 2.10 },
    ruler_drop: { status: 'completed', value: 9 },
    hip_abduction: { status: 'injured' },
    hip_adduction: STRONG_HIPS
  } };
  const ar = build(s);
  assert.deepEqual(ar.weapons.map(w => w.key), ['ruler_drop', 'hip_adduction']);
  assert.deepEqual(ar.priorities.map(p => p.key), ['sprint_10m']);
  assert.ok(ar.notTested.includes('Hip Abduction Strength') && ar.notTested.includes('Overhead Squat'));   // staff only
  assert.equal(ar.notInBattery, undefined);                           // athletes never see what wasn't tested
  assert.equal(JSON.stringify(ar).includes('Not part of this report'), false);
});

// ---------- next tier ----------

test('score line: a timed test in seconds, with the gap to the NEXT tier (not to Gold)', () => {
  const p = build().priorities.find(x => x.key === 'sprint_10m');      // 2.05 s, Bronze; Silver at 65 = 2.0123 s
  assert.equal(p.tier, 'Bronze');
  assert.equal(p.scoreLine, 'Your 10m sprint was 2.05 seconds. Silver starts at 2.01 seconds, so you\'re 0.04 seconds away.');
  assert.deepEqual(p.nextTier, { tier: 'Silver', points: 4, rawTarget: 2.01, rawGap: 0.04 });
  const s = copy(SESSION);
  s.tests.sprint_10m.value = 1.99;                                    // Silver -> Gold at 75 (1.93 s)
  assert.equal(build(s).priorities.find(x => x.key === 'sprint_10m').scoreLine,
    'Your 10m sprint was 1.99 seconds. Gold starts at 1.93 seconds, so you\'re 0.06 seconds away.');
});

test('score line: other tests as a score, said like a coach; hand-timed sprints give the hand time', () => {
  const ar = build();
  assert.equal(ar.priorities.find(x => x.key === 'overhead_squat').scoreLine,
    'You scored 60 on the overhead squat. Silver starts at 65, so you\'re 5 points away.');
  assert.equal(ar.priorities.find(x => x.key === 'hip_adduction').scoreLine,
    'You scored 63 on the groin strength test. Silver starts at 65, so you\'re 2 points away.');
  const s = copy(SESSION);
  s.timing_method = 'hand';
  s.tests.sprint_10m.value = 1.83;                                    // +0.22 = 2.05 s
  assert.equal(build(s).priorities.find(x => x.key === 'sprint_10m').scoreLine,
    'Your 10m sprint was 1.83 seconds (hand-timed). Silver starts at 1.79 seconds, so you\'re 0.04 seconds away.');
});

test('score line: band-only results use the score too; 1 point is singular', () => {
  const s = copy(SESSION);
  s.tests.overhead_squat = { status: 'completed', value: 55, band: 'below' };   // midpoint 48
  assert.equal(build(s).priorities.find(x => x.key === 'overhead_squat').scoreLine,
    'You scored 48 on the overhead squat. Silver starts at 65, so you\'re 17 points away.');
  s.tests.overhead_squat = { status: 'completed', value: 59, cutoffs: [30, 50, 65, 80] };              // score 64
  assert.match(build(s).priorities.find(x => x.key === 'overhead_squat').scoreLine, /so you're 1 point away\.$/);
});

test('athlete-facing text never names a device or a device unit', () => {
  const ar = build();
  const shown = JSON.stringify([
    ar.weapons.map(w => [w.nickname, w.headline, w.number, w.body, w.measures]),
    ar.priorities.map(p => [p.name, p.nickname, p.notice, p.why, p.fixIt, p.measures]),
    ar.fullResults, ar.plan.courtDrills, R.coachProse(ar)
  ]);
  assert.equal(R.DEVICE_WORDS.test(shown), false, String(shown.match(R.DEVICE_WORDS)));
});

test('priorities: nickname, "You\'ll notice it when", Why, "Fix it and", from the library, in that order', () => {
  const p = build().priorities.find(x => x.key === 'sprint_10m');
  const lib = LIB.tests.find(t => t.key === 'sprint_10m');
  assert.equal(p.nickname, 'Speed: your first three steps');
  assert.equal(p.notice, `You'll notice it when ${lib.notice}`);
  assert.deepEqual(p.why, ['You covered 10 metres in 2.05 seconds. Silver starts at 2.01 seconds, so you\'re 0.04 seconds away.']);
  assert.equal(p.fixIt, `Fix it and ${lib.fix_it}`);
});

test('Why: only the version(s) whose rule matches, filled from the engine', () => {
  const ar = build();
  assert.deepEqual(priority(ar, 'hip_adduction').why, [
    'Your groin is 67% as strong as your outer hip. We want it at 80% or more.',     // left 200 / 300
    'Your left side is 20% weaker than your other side.'                              // 200 vs 250
  ]);
  assert.deepEqual(priority(ar, 'overhead_squat').why, [
    'As you squatted, your arms dropped forward. A stiff upper back or tight shoulders make your lower back do the work on overheads.'
  ]);
  const b = build(base());
  assert.deepEqual(priority(b, 'shoulder_er').why, [
    'Your racket arm scored 67. Gold starts at 75, so you\'re 8 points away.',      // right arm 140 -> 67
    // 140 vs 160 is 12.5% weaker: the card's rounding sends a tie to the even number, so 12.
    'Your racket arm is 12% weaker than your other arm. Every overhead is a fast swing and a hard stop, and the back of the shoulder does the stopping.'
  ]);
  assert.deepEqual(priority(b, 'single_leg_stand').why, [
    'With your eyes closed, you held steady for 9 seconds. Gold starts at a score of 75, so you\'re 7 points away.',
    'Your left leg held steady for 57% less time than your other leg.'
  ]);
  assert.deepEqual(priority(b, 'trunk_rotation').why, ['Your upper body turns 24% less to the left than to the other side.']);
  const s = base();
  s.tests.trunk_rotation = { status: 'completed', left: 33, right: 35, cutoffs: [20, 30, 40, 55] };   // even, both low
  assert.deepEqual(priority(build(s), 'trunk_rotation').why, ['Your rotation scored 61. Silver starts at 65, so you\'re 4 points away.']);
});

test('5-0-5: the fastest foot is scored; one foot more than 5% slower shows the slower-foot Why', () => {
  const s = copy(SESSION);
  s.tests.cod_505 = { status: 'completed', left: 2.92, right: 2.75 };     // fastest 2.75 (score 52); left 6% slower
  const p = priority(build(s), 'cod_505');
  assert.equal(p.rank, 1);
  assert.deepEqual(p.why, [
    'You turned and came back in 2.75 seconds. Silver starts at 2.63 seconds, so you\'re 0.12 seconds away.',
    'You turn 6% slower off your left foot.'
  ]);
  assert.deepEqual(p.fixes.map(f => f.key), ['A', 'B']);                  // brake and turn + even both turns
  s.tests.cod_505 = { status: 'completed', left: 2.78, right: 2.75 };     // 1% apart: no slower-foot line
  assert.deepEqual(priority(build(s), 'cod_505').fixes.map(f => f.key), ['A']);
});

test('Why: {fault} is the "Fault seen" in plain words; none recorded says the coach will choose', () => {
  const squat = (fault) => {
    const s = copy(SESSION);
    s.observations = fault ? { overhead_squat_fault: fault } : {};
    return priority(build(s), 'overhead_squat').why[0];
  };
  assert.match(squat('heels_lift'), /^As you squatted, your heels lifted off the floor\. Tight ankles/);
  assert.match(squat('knees_cave'), /^As you squatted, your knees caved inward\. Tight ankles/);
  assert.match(squat('back_arch'), /^As you squatted, your lower back arched\. A stiff upper back/);
  assert.match(squat('arms_back'), /^As you squatted, your arms dropped forward or lower back arched\./);   // older reports
  assert.equal(squat(null), 'Your coach will go through what they saw and pick the right fix with you.');
  // A clean squat that still scored low has no matching Why: the plain score line instead.
  assert.equal(squat('clean'), 'You scored 60 on the overhead squat. Silver starts at 65, so you\'re 5 points away.');
});

test('Why: whole numbers, left/right in words, and no {placeholder} ever left in', () => {
  const sessions = [SESSION, base(), (() => { const s = base(); s.timing_method = 'hand'; s.tests.sprint_10m.value = 1.83; return s; })()];
  for (const s of sessions) {
    for (const position of ['LEFT', 'RIGHT']) {
      const ar = build(s, { ...PROFILE, position });
      for (const p of ar.priorities) {
        for (const line of p.why) {
          assert.equal(/[{}]/.test(line), false, line);
          for (const n of (line.match(/\d+(?:\.\d+)? (?:points?|%)|\d+%/g) || [])) assert.match(n, /^\d+/, line);
        }
      }
      for (const p of ar.priorities) for (const line of p.why.filter(l => /weaker|less/.test(l))) assert.match(line, /\b(left|right)\b|racket arm/, line);
    }
  }
});

// ---------- fixes: the library's rules ----------

test('hip adduction: below 80% of abduction on the SAME side -> Fix A; >10% side gap -> also Fix B', () => {
  // Left 200 / 300 = 67% (right 250 / 290 = 86%); left 20% weaker than right.
  assert.deepEqual(priority(build(), 'hip_adduction').fixes.map(f => f.key), ['A', 'B']);
  const s = copy(SESSION);
  s.tests.hip_adduction = { status: 'completed', left: 235, right: 240, cutoffs: [100, 180, 260, 340] };  // 78% / 83%, 2% gap
  assert.deepEqual(priority(build(s), 'hip_adduction').fixes.map(f => f.key), ['A']);
  s.tests.hip_adduction = { status: 'completed', left: 245, right: 240, cutoffs: [100, 180, 260, 340] };  // 82% / 83%: no rule -> C
  assert.deepEqual(priority(build(s), 'hip_adduction').fixes.map(f => f.key), ['C']);
});

test('shoulder ER: racket arm below target -> Fix A; racket arm >10% weaker -> also Fix B', () => {
  const s = base();                                                   // racket arm R: 140 vs 160 = 12.5% weaker
  const p = priority(build(s), 'shoulder_er');
  assert.deepEqual(p.fixes.map(f => f.key), ['A', 'B']);
  s.athlete.dominant_hand = 'L';                                      // racket arm now the stronger left
  assert.deepEqual(priority(build(s), 'shoulder_er').fixes.map(f => f.key), ['A']);
  s.tests.shoulder_er = { status: 'completed', left: 200, right: 140, cutoffs: [60, 100, 150, 220] };   // L strong, R weak
  assert.deepEqual(priority(build(s), 'shoulder_er').fixes.map(f => f.key), ['C']);   // racket arm fine, other arm weaker
});

test('trunk rotation: one side >10% less -> Fix A; both sides below target -> Fix B', () => {
  const s = base();                                                   // 38 vs 50: 24% less; sides 67 / 80
  assert.deepEqual(priority(build(s), 'trunk_rotation').fixes.map(f => f.key), ['A']);
  s.tests.trunk_rotation = { status: 'completed', left: 33, right: 35, cutoffs: [20, 30, 40, 55] };      // 6% less; both below 75
  assert.deepEqual(priority(build(s), 'trunk_rotation').fixes.map(f => f.key), ['B']);
});

test('single leg stand: either leg below target -> Fix A; one leg >20% worse -> also Fix B and the sprain question', () => {
  const s = base();                                                   // 9 s vs 21 s
  const p = priority(build(s), 'single_leg_stand');
  assert.deepEqual(p.fixes.map(f => f.key), ['A', 'B']);
  assert.deepEqual(p.coachNotes, ['Ask about past ankle sprains on that side.']);
  s.tests.single_leg_stand = { status: 'completed', left: 10, right: 11, cutoffs: [3, 8, 15, 25] };      // 9% gap
  assert.deepEqual(priority(build(s), 'single_leg_stand').fixes.map(f => f.key), ['A']);
});

test('hip abduction: below target -> Fix A; >10% side gap -> also Fix B', () => {
  const s = base();
  s.tests.hip_abduction = { status: 'completed', left: 220, right: 180, cutoffs: [100, 180, 260, 340] };  // 18% gap
  assert.deepEqual(priority(build(s), 'hip_abduction').fixes.map(f => f.key), ['A', 'B']);
});

test('overhead squat: the fault seen picks the fix; none recorded leaves it to the coach', () => {
  assert.deepEqual(priority(build(), 'overhead_squat').fixes.map(f => f.key), ['B']);       // arms dropped forward
  const s = copy(SESSION);
  for (const [fault, fix] of [['heels_lift', 'A'], ['knees_cave', 'A'], ['arms_drop', 'B'], ['back_arch', 'B'], ['heels_knees', 'A'], ['arms_back', 'B'], ['clean', 'C']]) {
    s.observations = { overhead_squat_fault: fault };
    assert.deepEqual(priority(build(s), 'overhead_squat').fixes.map(f => f.key), [fix], fault);
  }
  s.observations = {};
  const p = priority(build(s), 'overhead_squat');
  assert.deepEqual(p.fixes, []);
  assert.equal(p.fixPending, 'Your coach will go through what they saw and pick the right fix with you.');
});

test('observations: only known values are kept', () => {
  assert.deepEqual(R.cleanObservations({ overhead_squat_fault: 'back_arch', other: 1 }), { overhead_squat_fault: 'back_arch' });
  assert.deepEqual(R.cleanObservations({ overhead_squat_fault: 'arms_back' }), { overhead_squat_fault: 'arms_back' });
  assert.deepEqual(R.cleanObservations({ overhead_squat_fault: 'sideways' }), {});
  assert.deepEqual(R.cleanObservations(undefined), {});
});

// ---------- your full results ----------

test('full results: one plain line per test actually done, in library order; tests not done are skipped', () => {
  const ar = build();
  assert.deepEqual(ar.fullResults.map(r => r.key), ['sprint_10m', 'cod_505', 'ruler_drop', 'overhead_squat', 'trunk_rotation',
    'single_leg_stand', 'shoulder_er', 'hip_abduction', 'hip_adduction']);
  assert.deepEqual(ar.fullResults.find(r => r.key === 'cod_505').result, '2.55 seconds');      // the faster foot
  const sprintLib = LIB.tests.find(t => t.key === 'sprint_10m').fix_it;
  assert.deepEqual(ar.fullResults[0], { key: 'sprint_10m', test: '10m sprint', result: '2.05 seconds', tier: 'Bronze', next: '4 points from Silver', fixIt: `Fix it and ${sprintLib}` });
  const { fixIt, ...hipAdd } = ar.fullResults.find(r => r.key === 'hip_adduction');
  assert.deepEqual(hipAdd, { key: 'hip_adduction', test: 'Groin strength test', result: '63 out of 99', tier: 'Bronze', next: '2 points from Silver' });
  assert.equal(fixIt, `Fix it and ${LIB.tests.find(t => t.key === 'hip_adduction').fix_it}`);
  assert.equal(ar.fullResults.find(r => r.key === 'ruler_drop').next, 'At the top tier');
  const s = copy(SESSION);
  s.tests.trunk_rotation = { status: 'injured' };
  assert.equal(build(s).fullResults.some(r => r.key === 'trunk_rotation'), false);
});

test('full results: whole-number scores and gaps in whole points; tier follows the shown number', () => {
  const ar = build();
  for (const r of ar.fullResults) {
    assert.match(r.next, /^(\d+ points? from (Silver|Gold)|At the top tier)$/, r.key);
    if (/out of 99/.test(r.result)) assert.match(r.result, /^\d+ out of 99$/, r.key);
  }
  assert.equal(ar.fullResults.find(r => r.key === 'single_leg_stand').next, '7 points from Gold');   // 68.1 -> 68
  assert.equal(ar.fullResults.find(r => r.key === 'trunk_rotation').next, '1 point from Gold');     // 73.5 -> 74
  // 74.6 shows as 75: Gold, and never a priority with "0 points away".
  const s = copy(SESSION);
  s.tests.overhead_squat = { status: 'completed', value: 69.6, cutoffs: [30, 50, 65, 80] };          // 74.6
  const b = build(s);
  assert.deepEqual(b.fullResults.find(r => r.key === 'overhead_squat'), { ...b.fullResults.find(r => r.key === 'overhead_squat'), result: '75 out of 99', tier: 'Gold', next: 'At the top tier' });
  assert.equal(b.priorities.some(p => p.key === 'overhead_squat'), false);
});

test('full results: the library\'s "Fix it and…" line under each result', () => {
  for (const r of build().fullResults) {
    assert.equal(r.fixIt, `Fix it and ${LIB.tests.find(t => t.key === r.key).fix_it}`, r.key);
    assert.equal(r.better, undefined);
  }
});

test('full results and draft notice: plain words, no device names', () => {
  const ar = build();
  assert.equal(R.DEVICE_WORDS.test(JSON.stringify(ar.fullResults)), false);
  assert.equal(ar.draftNotice, 'Draft – pending clinical review');
  assert.equal(LIB.draft_notice, ar.draftNotice);                     // one setting: library/padel.json draft_notice
});

// ---------- plan and retest ----------

test('plan: one combined 6 weeks; a 4-week fix ends at week 4 and its maintain fix takes over', () => {
  const ar = build();
  assert.deepEqual(ar.plan.phases.map(p => p.label), ['Weeks 1–4', 'Weeks 5–6']);
  const [p1, p2] = ar.plan.phases;
  assert.deepEqual(p1.blocks.map(b => [b.key, b.fix]), [['overhead_squat', 'B'], ['sprint_10m', 'A'], ['hip_adduction', 'A'], ['hip_adduction', 'B']]);
  assert.deepEqual(p2.blocks.map(b => [b.key, b.fix]), [['overhead_squat', 'C'], ['sprint_10m', 'A'], ['hip_adduction', 'A'], ['hip_adduction', 'B']]);
  assert.deepEqual(p2.blocks[0].switchedFrom, ['shoulders and upper back']);
});

test('plan: an exercise shared by two fixes appears once', () => {
  const s = base();                                                   // overhead squat B + trunk rotation B
  s.tests.overhead_squat.value = 55;
  s.tests.trunk_rotation = { status: 'completed', left: 33, right: 35, cutoffs: [20, 30, 40, 55] };
  const plan = build(s).plan;
  const roller = 'Foam roller extensions on the upper back: 10 slow reps.';
  const all = plan.phases[0].blocks.flatMap(b => b.exercises);
  assert.equal(all.filter(e => e.text === roller).length, 1);
  assert.deepEqual(all.find(e => e.text === roller).alsoFor, ['Trunk Rotation']);
});

test('plan: court drills for the priorities, from the library, no side labels, never repeated', () => {
  const ar = build();
  const expected = ar.priorities.flatMap(p => LIB.tests.find(t => t.key === p.key).court_drills);
  assert.deepEqual(ar.plan.courtDrills.map(d => d.text), [...new Set(expected)]);
  assert.ok(ar.plan.courtDrills.every(d => !('label' in d)));
  assert.equal(ar.plan.roleDrills, undefined);
});

test('retest: test date plus the longest window among the priorities', () => {
  assert.deepEqual(build().retest, { weeks: 6, date: '2026-11-29', dateText: 'Sunday 29 November 2026' });
  const s = base();                                                   // only 4-week tests ranked
  s.tests.shoulder_er = { status: 'completed', left: 230, right: 228, cutoffs: [60, 100, 150, 220] };
  s.tests.overhead_squat.value = 55;
  const ar = build(s);
  assert.ok(ar.priorities.length && ar.priorities.every(p => p.retestWeeks === 4), ar.priorities.map(p => p.key).join());
  assert.deepEqual(ar.retest, { weeks: 4, date: '2026-11-15', dateText: 'Sunday 15 November 2026' });
});

// ---------- Gemini: words only ----------

// The payload part of the prompt (a retry appends the rejection reason after it).
const payloadOf = (prompt) => JSON.parse(prompt.split('PAYLOAD:\n')[1].split('\n\nYour previous answer')[0]);

const goodProse = (payload) => JSON.stringify({
  weapons: payload.weapons.map(w => `Ali, your ${w.test} result of ${w.result} is a real weapon.`),
  planIntro: `Six weeks of focused work, then we retest on ${payload.plan.retest_date}.`
});

test('coach text (no Gemini needed): the weapon sentences and plan intro, with the name and numbers', () => {
  const ar = build();
  const c = R.coachProse(ar);
  assert.deepEqual(Object.keys(c), ['weapons', 'planIntro']);          // role lines never go through Gemini
  assert.equal(c.weapons[1], 'Ali, your outer hips are strong and almost even, left vs right.');
  assert.equal(c.planIntro, 'Ali, this plan trains your top 3 priorities together: overhead squat, 10m sprint and groin strength. Stick with it for 6 weeks, then we retest on Sunday 29 November 2026 to measure how far you\'ve moved.');
});

test('form to report: the padel pipeline and the "Fault seen" reach the report', () => {
  const { forSport } = require('./scoredReport.service');
  const padel = forSport('padel');
  const { profile, session } = padel.validateInput(
    { name: 'Test Reves', dob: '2000-06-15', testDate: '2026-10-12', sex: 'F', position: 'LEFT', dominantHand: 'R', bodyweight: '61' },
    { timingMethod: 'electronic', tests: { sprint_10m: { status: 'completed', value: '2.05' }, ruler_drop: { status: 'completed', value: '12' },
      overhead_squat: { status: 'completed', value: '55', cutoffs: ['30', '50', '65', '80'], fault: 'knees_cave' } } });
  session.observations = R.cleanObservations({ overhead_squat_fault: 'knees_cave' });
  const ar = R.buildAthleteReport({ profile, scored: scoreSession(session, cfg), session, cfg });
  assert.equal(ar.firstName, 'Test');
  assert.match(ar.priorities[0].why[0], /^As you squatted, your knees caved inward\./);
});

test('narration: Gemini only polishes the weapon sentences and plan intro; it never sees the library lines or exercises', async () => {
  const ar = build();
  let seen;
  await R.narrateAthleteReport(ar, { callModel: async (sys, p) => { seen = payloadOf(p); return goodProse(seen); } });
  assert.equal(ar.prose.source, 'gemini');
  assert.equal(seen.first_name, 'Ali');
  assert.equal(seen.priorities, undefined);
  assert.equal(seen.playing_side, undefined);
  assert.deepEqual(seen.weapons.map(w => w.coach_text), R.coachProse(ar).weapons);
  const sent = JSON.stringify(seen);
  for (const p of ar.priorities) for (const x of [p.nickname, p.notice, ...p.why, p.fixIt]) assert.equal(sent.includes(x), false, x);
  assert.equal(sent.includes('Copenhagen'), false);
  assert.match(R.SYSTEM_PROMPT, /Never add, name or suggest an exercise/);
  assert.match(R.SYSTEM_PROMPT, /Never mention testing devices/);
});

test('narration: device names in Gemini\'s answer are rejected', async () => {
  const ar = build();
  let calls = 0;
  await R.narrateAthleteReport(ar, { callModel: async (sys, p) => {
    calls++;
    const ok = JSON.parse(goodProse(payloadOf(p)));
    if (calls === 1) ok.weapons[1] = 'Your Dynamo result is strong.';
    return JSON.stringify(ok);
  } });
  assert.equal(calls, 2);
  assert.equal(ar.prose.source, 'gemini');
});

test('narration: invented numbers and exercise prescriptions are rejected, then retried', async () => {
  const ar = build();
  let calls = 0;
  await R.narrateAthleteReport(ar, { callModel: async (sys, p) => {
    calls++;
    const ok = JSON.parse(goodProse(payloadOf(p)));
    if (calls === 1) ok.weapons[0] = 'You could drop to 9 cm soon.';
    if (calls === 2) ok.planIntro = 'Do Copenhagen planks: 3 sets of 10.';
    return JSON.stringify(ok);
  } });
  assert.equal(calls, 3);
  assert.equal(ar.prose.source, 'gemini');
  assert.equal(ar.prose.attempts, 3);
});

test('narration: after repeated rejection, or no AI, the coach text is used', async () => {
  const ar = build();
  await R.narrateAthleteReport(ar, { callModel: async () => '{"weapons": ["about 99"], "planIntro": ""}' });
  assert.equal(ar.prose.source, 'coach');
  assert.deepEqual(ar.prose, { ...R.coachProse(ar), source: 'coach', reason: ar.prose.reason });
  const ar2 = build();
  await R.narrateAthleteReport(ar2, { callModel: async () => { throw new Error('no key'); } });
  assert.equal(ar2.prose.source, 'coach');
  assert.equal(ar2.prose.weapons[0], 'Ali, your reactions are sharp.');
});

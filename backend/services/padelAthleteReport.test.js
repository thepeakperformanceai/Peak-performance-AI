// Run: npm test   (from backend/)
// Padel athlete report (the separate two-page PDF): the library matches
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
// Engine scores: sprint 60.8, ruler 82, beep 64.5, SLS 68.1, trunk 73.5, OHS 60,
// shoulder 69.6, hip abd 76.6, hip add 63.4.
const SESSION = {
  athlete: { age: 24, sex: 'M', position: 'RIGHT', dominant_hand: 'R' },
  timing_method: 'electronic',
  observations: { overhead_squat_fault: 'arms_back' },
  tests: {
    sprint_10m: { status: 'completed', value: 2.05 },
    ruler_drop: { status: 'completed', value: 12.0 },
    beep_test: { status: 'completed', level: 9, shuttle: 5 },
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
  // The scoring engine is unchanged: the 5-0-5 isn't in its padel battery, and its Beep Test has no library entry.
  assert.deepEqual(LIB.tests.filter(t => !cfg.tests[t.key]).map(t => t.key), ['cod_505']);
  assert.deepEqual(Object.keys(cfg.tests).filter(k => !LIB.tests.some(t => t.key === k)), ['beep_test']);
});

test('library: every role line, exercise, drill and rule is word for word from padel.md', () => {
  for (const t of LIB.tests) {
    const texts = [t.what_we_measured, ...Object.values(t.role_lines), ...Object.values(t.role_drills),
      ...Object.values(t.fixes).flatMap(f => f.exercises), ...t.rules.map(r => r.text)];
    if (t.retest_note) texts.push(t.retest_note);
    for (const s of texts) assert.ok(MD.includes(s), `${t.key}: not in padel.md: ${s}`);
    for (const [k, f] of Object.entries(t.fixes)) assert.ok(MD.includes(`Fix ${k}: ${f.title}`), `${t.key} Fix ${k}`);
    assert.ok(MD.includes(`Retest: ${t.retest_weeks} weeks`), `${t.key} retest`);
  }
});

test('library: rules point at fixes that exist; every line has Drive, Revés and Every player', () => {
  for (const t of LIB.tests) {
    for (const r of t.rules) assert.ok(t.fixes[r.fix], `${t.key} rule -> Fix ${r.fix}`);
    if (t.maintain_fix) assert.equal(t.fixes[t.maintain_fix].kind, 'maintain', t.key);
    assert.ok(['drive', 'reves', 'every'].every(k => t.role_lines[k] && t.role_drills[k]), t.key);
  }
});

test('library: sides match the padel court-side field; tiers and target match the card tiers', () => {
  assert.deepEqual(Object.keys(LIB.sides).sort(), [...SPORT_PROFILES.padel.positions].sort());
  assert.deepEqual(LIB.tiers.map(t => [t.key, t.min_score]), CARD_TIERS.tiers.map(t => [t.key, t.min_ovr]));
  assert.equal(LIB.target.score, 75);
  assert.equal(LIB.rebuild.text, 'Want to be coached through it? PeakPerformance Rebuild is a one-month plan with two sessions a week with our team: testing, healing and strengthening.');
  assert.equal(LIB.rebuild.url, 'REBUILD_URL');
});

// ---------- scores come from the engine, unchanged ----------

test('scores: every score in the report is the engine\'s own number', () => {
  const scored = scoreSession(SESSION, cfg);
  const ar = R.buildAthleteReport({ profile: PROFILE, scored, session: SESSION, cfg });
  for (const x of [...ar.weapons, ...ar.priorities]) {
    assert.equal(x.score, scored.tests.find(t => t.name === x.key).score, x.key);
  }
  assert.deepEqual(scoreSession(SESSION, cfg), scored);                 // building the report changes nothing
});

// ---------- playing side ----------

test('side: Drive and Revés see their lines plus Every player; Both sees all lines', () => {
  const who = (pos) => build(SESSION, { ...PROFILE, position: pos }).priorities[0].lines.map(l => l.label);
  assert.deepEqual(who('RIGHT'), ['Drive', 'Every player']);
  assert.deepEqual(who('LEFT'), ['Revés', 'Every player']);
  assert.deepEqual(who('BOTH'), ['Drive', 'Revés', 'Every player']);
  const drills = (pos) => build(SESSION, { ...PROFILE, position: pos }).plan.roleDrills.map(d => d.label);
  assert.ok(!drills('LEFT').includes('Drive') && drills('LEFT').includes('Revés'));
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
  assert.deepEqual(ar.weapons.map(w => [w.key, w.score, w.tier]), [['ruler_drop', 82, 'Gold'], ['hip_abduction', 76.6, 'Gold']]);
  assert.deepEqual(ar.weapons.map(w => w.headline), ['Fast hands at the net', 'Fast first step to the middle']);
  assert.deepEqual(ar.weapons.map(w => w.number), [{ value: '12 cm', isScore: false }, { value: '76.6', isScore: true }]);
  // Hip abduction 300 / 290: about 3% apart.
  assert.equal(ar.weapons[1].body, 'your outer hips are strong and almost even, left vs right');
  assert.equal(ar.weapons[1].line.label, 'Drive');
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
  assert.deepEqual(ar.priorities.map(p => [p.key, p.gapToTarget]), [['overhead_squat', 15], ['sprint_10m', 14.2], ['hip_adduction', 11.6]]);
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
  assert.ok(ar.notTested.includes('Hip Abduction Strength') && ar.notTested.includes('Overhead Squat'));
  assert.deepEqual(ar.notInBattery, ['5-0-5 Agility Test']);
  assert.equal(ar.notTested.includes('5-0-5 Agility Test'), false);
});

// ---------- next tier ----------

test('score line: a timed test in seconds, with the gap to the NEXT tier (not to Gold)', () => {
  const p = build().priorities.find(x => x.key === 'sprint_10m');      // 2.05 s, Bronze; Silver at 65 = 2.0123 s
  assert.equal(p.tier, 'Bronze');
  assert.equal(p.scoreLine, 'Your 10m sprint was 2.05 seconds. Silver starts at 2.01 seconds, so you\'re 0.04 seconds away.');
  assert.deepEqual(p.nextTier, { tier: 'Silver', points: 4.2, rawTarget: 2.01, rawGap: 0.04 });
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
    'You scored 63.4 on the groin strength test. Silver starts at 65, so you\'re 1.6 points away.');
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

test('athlete-facing text never names a device or a device unit, on any side', () => {
  for (const position of ['RIGHT', 'LEFT', 'BOTH']) {
    const ar = build(SESSION, { ...PROFILE, position });
    const shown = JSON.stringify([
      ar.weapons.map(w => [w.plainName, w.headline, w.number, w.body, w.measures]),
      ar.priorities.map(p => [p.name, p.plainName, p.scoreLine, p.ruleNotes, p.measures]),
      ar.fullResults,
      R.coachProse(ar)
    ]);
    assert.equal(R.DEVICE_WORDS.test(shown), false, `${position}: ${shown.match(R.DEVICE_WORDS)}`);
  }
});

test('rule sentences: the library\'s left/right and ratio rules, in plain words with the athlete\'s numbers', () => {
  assert.deepEqual(build().priorities.find(p => p.key === 'hip_adduction').ruleNotes, [
    'On your left side, your groin is 67% as strong as your outer hip. We want it at 80% or more.',
    'Your left side is 20% weaker than your right side.'
  ]);
  const ar = build(base());
  assert.deepEqual(priority(ar, 'shoulder_er').ruleNotes, ['Your racket arm is 13% weaker than your other arm.']);
  assert.deepEqual(priority(ar, 'single_leg_stand').ruleNotes, ['Your left leg held on for 57% less time than your right leg.']);
  assert.deepEqual(priority(ar, 'trunk_rotation').ruleNotes, ['Your left side turns 24% less than your right side.']);
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
  assert.deepEqual(priority(build(), 'overhead_squat').fixes.map(f => f.key), ['B']);
  const s = copy(SESSION);
  s.observations = { overhead_squat_fault: 'heels_knees' };
  assert.deepEqual(priority(build(s), 'overhead_squat').fixes.map(f => f.key), ['A']);
  s.observations = {};
  const p = priority(build(s), 'overhead_squat');
  assert.deepEqual(p.fixes, []);
  assert.match(p.fixPending, /fault pattern was not recorded/);
});

test('observations: only known values are kept', () => {
  assert.deepEqual(R.cleanObservations({ overhead_squat_fault: 'arms_back', other: 1 }), { overhead_squat_fault: 'arms_back' });
  assert.deepEqual(R.cleanObservations({ overhead_squat_fault: 'sideways' }), {});
  assert.deepEqual(R.cleanObservations(undefined), {});
});

// ---------- your full results ----------

test('full results: one plain line per test actually done, in library order; tests not done are skipped', () => {
  const ar = build();
  assert.deepEqual(ar.fullResults.map(r => r.key), ['sprint_10m', 'ruler_drop', 'overhead_squat', 'trunk_rotation',
    'single_leg_stand', 'shoulder_er', 'hip_abduction', 'hip_adduction']);           // no 5-0-5 (not done)
  const sprintLib = LIB.tests.find(t => t.key === 'sprint_10m').improve;
  assert.deepEqual(ar.fullResults[0], { key: 'sprint_10m', test: '10m sprint', result: '2.05 seconds', tier: 'Bronze', next: '0.04 seconds from Silver', better: sprintLib.drive });
  const { better, ...hipAdd } = ar.fullResults.find(r => r.key === 'hip_adduction');
  assert.deepEqual(hipAdd, { key: 'hip_adduction', test: 'Groin strength test', result: '63.4 out of 99', tier: 'Bronze', next: '1.6 points from Silver' });
  assert.equal(better, LIB.tests.find(t => t.key === 'hip_adduction').improve.drive);
  assert.equal(ar.fullResults.find(r => r.key === 'ruler_drop').next, 'At the top tier');
  const s = copy(SESSION);
  s.tests.trunk_rotation = { status: 'injured' };
  assert.equal(build(s).fullResults.some(r => r.key === 'trunk_rotation'), false);
});

test('full results: one "better score" line each: Drive line, Revés line, or Every player for Both', () => {
  const sprint = (position) => build(SESSION, { ...PROFILE, position }).fullResults.find(r => r.key === 'sprint_10m').better;
  const lib = LIB.tests.find(t => t.key === 'sprint_10m').improve;
  assert.equal(sprint('RIGHT'), lib.drive);
  assert.equal(sprint('LEFT'), lib.reves);
  assert.equal(sprint('BOTH'), lib.every);
  for (const r of build().fullResults) assert.ok(r.better && r.better.length, r.key);
});

test('full results and draft notice: plain words, no device names', () => {
  const ar = build();
  assert.equal(R.DEVICE_WORDS.test(JSON.stringify(ar.fullResults)), false);
  assert.equal(ar.draftNotice, 'Draft – pending clinical review');
  assert.equal(LIB.draft_notice, ar.draftNotice);                     // one setting: library/padel.json draft_notice
});

test('library: the "better score" lines are kept for review, words only', () => {
  for (const t of LIB.tests) {
    assert.deepEqual(Object.keys(t.improve).sort(), ['drive', 'every', 'reves'], t.key);
    for (const line of Object.values(t.improve)) assert.equal(/\d/.test(line), false, `${t.key}: ${line}`);
  }
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

test('plan: role drills for the athlete\'s side, never repeated', () => {
  const d = build().plan.roleDrills;
  assert.equal(d.length, 6);                                           // 3 priorities x (Drive + Every player)
  assert.ok(d.every(x => ['Drive', 'Every player'].includes(x.label)));
  assert.equal(new Set(d.map(x => x.text)).size, d.length);
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
  priorities: payload.priorities.map(p => `Ali, ${p.score_line} This matters on the drive side.`),
  planIntro: `Six weeks of focused work, then we retest on ${payload.plan.retest_date}.`
});

test('coach text (no Gemini needed): full sentences with the name, the numbers and every library line', () => {
  const ar = build();
  const c = R.coachProse(ar);
  assert.equal(c.weapons[1], 'Ali, your outer hips are strong and almost even, left vs right. On the drive side, pushing off sideways to cover the middle starts here. Strong outer hips mean a faster first lateral step.');
  assert.equal(c.priorities[2], 'Ali, on your left side, your groin is 67% as strong as your outer hip. We want it at 80% or more. ' +
    'Your left side is 20% weaker than your right side. On the drive side, pulling yourself back to the centre after a wide ball uses these muscles. ' +
    'Strong adductors mean a faster recovery step. And for every player, groin strains are common in sports with sudden sideways stops. ' +
    'A strong groin, roughly as strong as the outer hip, is the best protection.');
  assert.equal(c.planIntro, 'Ali, this plan trains your top 3 priorities together: overhead squat, 10m sprint and groin strength. Stick with it for 6 weeks, then we retest on Sunday 29 November 2026 to measure how far you\'ve moved.');
  // Every role line for the athlete's side is in the text.
  for (const [i, p] of ar.priorities.entries()) {
    for (const l of p.lines) assert.ok(c.priorities[i].includes(l.text.slice(1, 40)), `${p.key} ${l.label}`);
  }
  // "They keep your pelvis level..." reads as "these muscles keep..." mid-sentence.
  const s = base();
  s.tests.hip_abduction = { status: 'completed', left: 220, right: 180, cutoffs: [100, 180, 260, 340] };
  const ab = build(s, { ...PROFILE, position: 'BOTH' });
  const i = ab.priorities.findIndex(p => p.key === 'hip_abduction');
  assert.match(R.coachProse(ab).priorities[i], /And for every player, these muscles keep your pelvis level/);
});

test('narration: Gemini only polishes the coach text, and sees no exercises', async () => {
  const ar = build();
  let seen;
  await R.narrateAthleteReport(ar, { callModel: async (sys, p) => { seen = payloadOf(p); return goodProse(seen); } });
  assert.equal(ar.prose.source, 'gemini');
  assert.equal(seen.first_name, 'Ali');
  assert.deepEqual(seen.priorities.map(p => p.coach_text), R.coachProse(ar).priorities);
  assert.equal(JSON.stringify(seen).includes('Copenhagen'), false);    // exercises are never sent
  assert.match(R.SYSTEM_PROMPT, /Never add, name or suggest an exercise/);
  assert.match(R.SYSTEM_PROMPT, /Never mention testing devices/);
});

test('narration: device names in Gemini\'s answer are rejected', async () => {
  const ar = build();
  let calls = 0;
  await R.narrateAthleteReport(ar, { callModel: async (sys, p) => {
    calls++;
    const ok = JSON.parse(goodProse(payloadOf(p)));
    if (calls === 1) ok.priorities[0] = 'Your HumanTrak result shows room to grow.';
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
    if (calls === 2) ok.priorities[0] = 'Try Copenhagen planks: 3 sets of 10.';
    return JSON.stringify(ok);
  } });
  assert.equal(calls, 3);
  assert.equal(ar.prose.source, 'gemini');
  assert.equal(ar.prose.attempts, 3);
});

test('narration: after repeated rejection, or no AI, the coach text is used', async () => {
  const ar = build();
  await R.narrateAthleteReport(ar, { callModel: async () => '{"weapons": ["about 99"], "priorities": [], "planIntro": ""}' });
  assert.equal(ar.prose.source, 'coach');
  assert.deepEqual(ar.prose, { ...R.coachProse(ar), source: 'coach', reason: ar.prose.reason });
  const ar2 = build();
  await R.narrateAthleteReport(ar2, { callModel: async () => { throw new Error('no key'); } });
  assert.equal(ar2.prose.source, 'coach');
  assert.match(ar2.prose.priorities[0], /^Ali, on the drive side, low balls at your feet/);
});

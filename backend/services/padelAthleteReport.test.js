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

// ---------- weapons and ranking ----------

test('weapons: the two best scores', () => {
  const ar = build();
  assert.deepEqual(ar.weapons.map(w => [w.key, w.score, w.tier]), [['ruler_drop', 82, 'Gold'], ['hip_abduction', 76.6, 'Gold']]);
  assert.equal(ar.weapons[0].result, '12 cm');
  assert.equal(ar.weapons[1].result, 'left 300 N, right 290 N');
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

test('next tier: raw gap in the test\'s units to the NEXT tier, not to Gold', () => {
  const p = build().priorities.find(x => x.key === 'sprint_10m');      // 2.05 s, Bronze; Silver at 65 = 2.0123 s
  assert.equal(p.tier, 'Bronze');
  assert.deepEqual(p.nextTier, { tier: 'Silver', points: 4.2, rawTarget: 2.01, rawGap: 0.04, text: '0.04 s from Silver' });
  const s = copy(SESSION);
  s.tests.sprint_10m.value = 1.99;                                    // Silver -> Gold at 75 (1.93 s)
  assert.equal(build(s).priorities.find(x => x.key === 'sprint_10m').nextTier.text, '0.06 s from Gold');
});

test('next tier: hand-timed sprints give the hand time; Gold has none; bilateral and composite say where it starts', () => {
  const s = copy(SESSION);
  s.timing_method = 'hand';
  s.tests.sprint_10m.value = 1.83;                                    // +0.22 = 2.05 s
  const p = build(s).priorities.find(x => x.key === 'sprint_10m');
  assert.equal(p.result, '1.83 s (hand-timed)');
  assert.equal(p.nextTier.text, '0.04 s from Silver');
  const ar = build();
  assert.equal(ar.weapons[0].nextTier, null);
  assert.equal(ar.priorities.find(x => x.key === 'hip_adduction').nextTier.text, 'Silver starts at about 233 N each side');
  assert.equal(ar.priorities.find(x => x.key === 'overhead_squat').nextTier.text, 'Silver starts at a HumanTrak score of 60');
});

test('next tier: VALD band only (no cut-offs) gives score points, never a made-up raw target', () => {
  const s = copy(SESSION);
  s.tests.overhead_squat = { status: 'completed', value: 55, band: 'below' };   // midpoint 48
  const p = build(s).priorities.find(x => x.key === 'overhead_squat');
  assert.deepEqual(p.nextTier, { tier: 'Silver', points: 17, text: '17 points from Silver' });
});

// ---------- fixes: the library's rules ----------

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
  assert.deepEqual(build().retest, { weeks: 6, date: '2026-11-29' });
  const s = base();                                                   // only 4-week tests ranked
  s.tests.shoulder_er = { status: 'completed', left: 230, right: 228, cutoffs: [60, 100, 150, 220] };
  s.tests.overhead_squat.value = 55;
  const ar = build(s);
  assert.ok(ar.priorities.length && ar.priorities.every(p => p.retestWeeks === 4), ar.priorities.map(p => p.key).join());
  assert.deepEqual(ar.retest, { weeks: 4, date: '2026-11-15' });
});

// ---------- Gemini: words only ----------

// The payload part of the prompt (a retry appends the rejection reason after it).
const payloadOf = (prompt) => JSON.parse(prompt.split('PAYLOAD:\n')[1].split('\n\nYour previous answer')[0]);

const goodProse = (payload) => JSON.stringify({
  weapons: payload.weapons.map(w => `Ali, your ${w.test} result of ${w.result} is a real weapon.`),
  priorities: payload.priorities.map(p => `Ali, your ${p.test} came in at ${p.result}${p.next_tier ? `, ${p.next_tier}` : ''}. This matters on the drive side.`),
  planIntro: `Six weeks of focused work, then we retest on ${payload.plan.retest_date}.`
});

test('narration: Gemini sees only the chosen text and numbers; wording kept when it passes', async () => {
  const ar = build();
  let seen;
  await R.narrateAthleteReport(ar, { callModel: async (sys, p) => { seen = payloadOf(p); return goodProse(seen); } });
  assert.equal(ar.prose.source, 'gemini');
  assert.equal(seen.first_name, 'Ali');
  assert.deepEqual(seen.priorities.map(p => p.test), ar.priorities.map(p => p.name));
  assert.equal(JSON.stringify(seen).includes('Copenhagen'), false);    // exercises are never sent
  assert.match(R.SYSTEM_PROMPT, /Never add, name or suggest an exercise/);
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

test('narration: after repeated rejection, or no AI, the library text is used', async () => {
  const ar = build();
  await R.narrateAthleteReport(ar, { callModel: async () => '{"weapons": ["about 99"], "priorities": [], "planIntro": ""}' });
  assert.equal(ar.prose.source, 'library');
  assert.deepEqual(ar.prose, { ...R.libraryProse(ar), source: 'library', reason: ar.prose.reason });
  const ar2 = build();
  await R.narrateAthleteReport(ar2, { callModel: async () => { throw new Error('no key'); } });
  assert.equal(ar2.prose.source, 'library');
  assert.match(ar2.prose.priorities[0], /^Overhead Squat: 55 \(HumanTrak score\) \(Silver starts at a HumanTrak score of 60\)\. Drive: /);
});

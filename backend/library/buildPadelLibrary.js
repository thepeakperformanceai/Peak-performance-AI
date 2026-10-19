// library/buildPadelLibrary.js
// Builds library/padel.json from docs/library/padel.md.
//
//   node scripts/build-padel-library.js          (writes library/padel.json)
//   node scripts/build-padel-library.js --check  (fails if the JSON is out of date)
//
// The words (nickname, "You'll notice it when", "Why" versions, "Fix it and",
// rules, fixes, court drills, retest) come from padel.md, word for word.
// What padel.md can't say lives in ENGINE below: which engine check decides
// each rule and each "Why" version, the engine's test key, and a few
// PeakPerformance labels (plain test name, weapon headline). The build fails
// if padel.md and ENGINE disagree on a test's rules, "Why" versions or fixes.

const FAULTS = ['heels_lift', 'knees_cave', 'arms_drop', 'back_arch', 'clean'];
// Earlier reports stored the combined values; they still read correctly.
const LEGACY_FAULTS = { heels_knees: 'heels lifted or knees caved in', arms_back: 'arms dropped forward or lower back arched' };

const obs = (values) => ({ type: 'observation', key: 'overhead_squat_fault', in: values });
const HEELS_KNEES = ['heels_lift', 'knees_cave', 'heels_knees'];
const ARMS_BACK = ['arms_drop', 'back_arch', 'arms_back'];

// One entry per test, in padel.md order.
const ENGINE = [
  {
    key: 'sprint_10m', plain_name: '10m sprint', measures: 'Speed',
    rules: [{ type: 'score_below_target' }, { type: 'score_at_least_target' }],
    why: [{ type: 'score_below_target' }, { type: 'score_at_least_target' }],
    kinds: { A: 'main', B: 'maintain' }, maintain_fix: 'B',
    weapon: { headline: 'Quick off the mark', body: 'you are quick over the first few steps' }
  },
  {
    key: 'cod_505', plain_name: '5-0-5 turn test', measures: 'Agility',
    rules: [{ type: 'score_below_target' }, { type: 'slower_side_pct_over', pct: 5 }],
    why: [{ type: 'score_below_target' }, { type: 'slower_side_pct_over', pct: 5 }],
    kinds: { A: 'main', B: 'addon' }, maintain_fix: null,
    weapon: { headline: 'Sharp stop and turn', body: 'you brake and turn fast' }
  },
  {
    key: 'ruler_drop', plain_name: 'ruler-drop catch', measures: 'Reaction',
    rules: [{ type: 'score_below_target' }, { type: 'score_at_least_target' }],
    why: [{ type: 'score_below_target' }, { type: 'score_at_least_target' }],
    kinds: { A: 'main', B: 'maintain' }, maintain_fix: 'B',
    weapon: { headline: 'Fast hands at the net', body: 'your reactions are sharp' }
  },
  {
    key: 'overhead_squat', plain_name: 'overhead squat', measures: 'Movement',
    rules: [obs(HEELS_KNEES), obs(ARMS_BACK), obs(['clean'])],
    why: [obs(HEELS_KNEES), obs(ARMS_BACK), { type: 'observation_missing', key: 'overhead_squat_fault' }],
    kinds: { A: 'main', B: 'main', C: 'maintain' }, maintain_fix: 'C', needs_observation: 'overhead_squat_fault',
    weapon: { headline: 'Low and tall when it counts', body: 'your ankles, hips, upper back and shoulders work well together when you squat with your arms overhead' }
  },
  {
    key: 'trunk_rotation', plain_name: 'trunk rotation test', measures: 'Mobility',
    rules: [{ type: 'side_gap_pct_over', pct: 10 }, { type: 'both_sides_below_target' }],
    why: [{ type: 'side_gap_pct_over', pct: 10 }, { type: 'both_sides_below_target' }],
    kinds: { A: 'main', B: 'main' }, maintain_fix: null,
    weapon: {
      headline: 'Free shoulder turn', body: 'your upper body turns freely, {evenness}',
      evenness: { even: 'almost the same to each side', fair: 'fairly even to each side', uneven: 'turning further to your {side} by {pct}%', one_side: 'measured on one side only' }
    }
  },
  {
    key: 'single_leg_stand', plain_name: 'one-leg balance test', measures: 'Balance',
    rules: [{ type: 'either_side_below_target' }, { type: 'side_gap_pct_over', pct: 20 }],
    why: [{ type: 'either_side_below_target' }, { type: 'side_gap_pct_over', pct: 20 }],
    kinds: { A: 'main', B: 'addon' }, maintain_fix: null,
    weapon: {
      headline: 'Steady on one leg', body: 'you stay steady on one leg with your eyes closed, {evenness}',
      evenness: { even: 'almost the same on each leg', fair: 'fairly even on each leg', uneven: 'steadier on your {side} leg by {pct}%', one_side: 'measured on one leg only' }
    }
  },
  {
    key: 'shoulder_er', plain_name: 'shoulder strength test', measures: 'Strength',
    rules: [{ type: 'racket_side_below_target' }, { type: 'racket_side_weaker_pct_over', pct: 10 }, { type: 'otherwise' }],
    why: [{ type: 'racket_side_below_target' }, { type: 'racket_side_weaker_pct_over', pct: 10 }],
    kinds: { A: 'main', B: 'addon', C: 'maintain' }, maintain_fix: 'C',
    weapon: { headline: 'A shoulder built for overheads', body: 'the back of your shoulders is strong and {evenness}', evenness: 'strength' }
  },
  {
    key: 'hip_abduction', plain_name: 'outer-hip strength test', measures: 'Strength',
    rules: [{ type: 'score_below_target' }, { type: 'side_gap_pct_over', pct: 10 }, { type: 'otherwise' }],
    why: [{ type: 'score_below_target' }, { type: 'side_gap_pct_over', pct: 10 }],
    kinds: { A: 'main', B: 'addon', C: 'maintain' }, maintain_fix: 'C',
    weapon: { headline: 'Fast first step to the middle', body: 'your outer hips are strong and {evenness}', evenness: 'strength' }
  },
  {
    key: 'hip_adduction', plain_name: 'groin strength test', measures: 'Strength',
    rules: [{ type: 'same_side_ratio_below', denominator: 'hip_abduction', ratio: 0.8 }, { type: 'side_gap_pct_over', pct: 10 }, { type: 'otherwise' }],
    why: [{ type: 'same_side_ratio_below', denominator: 'hip_abduction', ratio: 0.8 }, { type: 'side_gap_pct_over', pct: 10 }],
    kinds: { A: 'main', B: 'addon', C: 'maintain' }, maintain_fix: 'C',
    weapon: { headline: 'Quick recovery to the centre', body: 'your groin muscles are strong and {evenness}', evenness: 'strength' }
  }
];
const STRENGTH_EVENNESS = { even: 'almost even, left vs right', fair: 'fairly even, left vs right', uneven: 'stronger on your {side} side by {pct}%', one_side: 'measured on one side only' };

const fail = (msg) => { throw new Error(`padel.md: ${msg}`); };
const plain = (s) => s.replace(/\*\*/g, '').replace(/\*/g, '').trim();

// "(6 weeks, 2 sessions a week)" -> { weeks: 6, frequency: '2 sessions a week' }
const fixTiming = (paren) => {
  if (!paren) return { weeks: null, frequency: null };
  const m = /^(\d+) weeks?(?:,\s*(.+))?$/.exec(paren.trim());
  return m ? { weeks: Number(m[1]), frequency: m[2] || null } : { weeks: null, frequency: paren.trim() };
};

const bulletsAfter = (lines, i) => {
  const out = [];
  for (let j = i + 1; j < lines.length; j++) {
    const l = lines[j];
    if (!l.trim()) { if (out.length) break; continue; }
    if (!l.startsWith('- ')) break;
    out.push(l.slice(2).trim());
  }
  return out;
};

function parseTest(title, body) {
  const head = /^\d+\.\s+(.+?)\s+\(([^)]+)\)$/.exec(title) || fail(`bad test heading "${title}"`);
  const lines = body.split('\n');
  const find = (re) => lines.findIndex(l => re.test(l));
  const lineAfter = (prefix) => {
    const l = lines.find(x => x.startsWith(prefix));
    if (!l) fail(`${head[1]}: missing "${prefix}"`);
    return l.slice(prefix.length).trim();
  };

  const measuredAt = find(/^\*\*What we measured\.\*\*/);
  const nickLine = lines.slice(measuredAt + 1).find(l => /^\*\*[^*]+\*\*$/.test(l.trim()));
  if (!nickLine) fail(`${head[1]}: missing nickname`);

  const whyAt = find(/^\*\*Why:\*\*/);
  if (whyAt === -1) fail(`${head[1]}: missing "Why:"`);
  const why = bulletsAfter(lines, whyAt).map(b => {
    const m = /^\*([^*]+):\*\s+(.+)$/.exec(b) || fail(`${head[1]}: bad Why line "${b}"`);
    return { label: m[1].trim(), text: m[2].trim() };
  });

  const rulesAt = find(/^\*\*How we read your result\.\*\*/);
  const rules = bulletsAfter(lines, rulesAt).map(b => {
    const m = /→\s+(also\s+)?show\s+\*\*Fix ([A-C]): ([^*]+)\*\*\.?\s*(.*)$/.exec(b) || fail(`${head[1]}: bad rule "${b}"`);
    return { text: plain(b), fix: m[2], also: !!m[1], proposed: /\(proposed\)|proposed\)/.test(b), coach_note: m[4].trim() || null };
  });

  const fixes = {};
  let drills = [];
  lines.forEach((l, i) => {
    const f = /^\*Fix ([A-C]): ([^(*]+?)(?:\s+\(([^)]*)\))?\*$/.exec(l.trim());
    if (f) fixes[f[1]] = { title: f[2].trim(), ...fixTiming(f[3]), exercises: bulletsAfter(lines, i) };
    if (/^\*Court drills/.test(l.trim())) drills = bulletsAfter(lines, i);
  });

  const retest = /^(\d+) weeks?\.\s*(.*)$/.exec(lineAfter('**Retest:**')) || fail(`${head[1]}: bad retest`);
  return {
    name: head[1],
    what_we_measured: lineAfter('**What we measured.**'),
    nickname: plain(nickLine),
    notice: lineAfter("**You'll notice it when**"),
    why,
    fix_it: lineAfter('**Fix it and**'),
    rules,
    fixes,
    court_drills: drills,
    retest_weeks: Number(retest[1]),
    retest_note: retest[2].trim() || null
  };
}

/**
 * padel.md text -> the library object. settings.draft_notice is carried over
 * from the current JSON (it's a switch, not library wording).
 */
function buildPadelLibrary(md, settings = {}) {
  const date = (/^([A-Z][a-z]{2} \d{1,2}, \d{4})/m.exec(md) || [])[1] || '';
  const sections = md.split(/^## /m).slice(1).filter(s => /^\d+\./.test(s));
  if (sections.length !== ENGINE.length) fail(`expected ${ENGINE.length} tests, found ${sections.length}`);

  const tests = sections.map((sec, i) => {
    const [title, ...rest] = sec.split('\n');
    const t = parseTest(title.trim(), rest.join('\n'));
    const e = ENGINE[i];
    if (t.why.length !== e.why.length) fail(`${t.name}: ${t.why.length} Why versions, engine expects ${e.why.length}`);
    if (t.rules.length !== e.rules.length) fail(`${t.name}: ${t.rules.length} rules, engine expects ${e.rules.length}`);
    const letters = Object.keys(t.fixes).sort().join('');
    if (letters !== Object.keys(e.kinds).sort().join('')) fail(`${t.name}: fixes ${letters}, engine expects ${Object.keys(e.kinds).join('')}`);
    return {
      key: e.key,
      name: t.name,
      plain_name: e.plain_name,
      measures: e.measures,
      what_we_measured: t.what_we_measured,
      nickname: t.nickname,
      notice: t.notice,
      why: t.why.map((w, k) => ({ label: w.label, when: e.why[k], text: w.text })),
      fix_it: t.fix_it,
      rules: t.rules.map((r, k) => ({
        when: e.rules[k], fix: r.fix, text: r.text,
        ...(r.also ? { also: true } : {}), ...(r.proposed ? { proposed: true } : {}), ...(r.coach_note ? { coach_note: r.coach_note } : {})
      })),
      ...(e.needs_observation ? { needs_observation: e.needs_observation } : {}),
      fixes: Object.fromEntries(Object.entries(t.fixes).map(([k, f]) => [k, { title: f.title, kind: e.kinds[k], weeks: f.weeks, frequency: f.frequency, exercises: f.exercises }])),
      maintain_fix: e.maintain_fix,
      court_drills: t.court_drills,
      retest_weeks: t.retest_weeks,
      retest_note: t.retest_note,
      weapon: { ...e.weapon, ...(e.weapon.evenness === 'strength' ? { evenness: STRENGTH_EVENNESS } : {}) }
    };
  });

  return {
    library_version: 'padel-library-v2.1',
    sport: 'padel',
    source: `docs/library/padel.md (${date})`,
    notes: 'Built from docs/library/padel.md by scripts/build-padel-library.js; edit padel.md, then rebuild. One version for every player (no playing side). Scores come from the existing scoring engine, unchanged. Words in curly brackets are filled in by the engine from the athlete\'s results; Gemini never writes or changes these lines. plain_name, measures and weapon (headline, body, evenness) are PeakPerformance wording added for the report, not text from padel.md.',
    draft_notice: settings.draft_notice === undefined ? 'Draft – pending clinical review' : settings.draft_notice,
    draft_notice_help: 'Shown in the footer of every page of the padel athlete report. Set draft_notice to null (or "") to switch it off; applies to reports generated after the change. Kept when the library is rebuilt.',
    target: { score: 75, label: 'Gold', text: 'Tier target is the Gold line (score 75). Priorities are ranked by score points below 75, biggest gap first; ties keep library order.' },
    tiers: [
      { key: 'gold', label: 'Gold', min_score: 75 },
      { key: 'silver', label: 'Silver', min_score: 65 },
      { key: 'bronze', label: 'Bronze', min_score: 0 }
    ],
    plan: { weeks: 6, text: 'One combined 6-week plan: every selected fix runs from week 1. A fix shorter than 6 weeks switches to that test\'s maintain fix (where the library has one) for the remaining weeks.' },
    fault_words: {
      heels_lift: 'heels lifted off the floor',
      knees_cave: 'knees caved inward',
      arms_drop: 'arms dropped forward',
      back_arch: 'lower back arched',
      ...LEGACY_FAULTS
    },
    tests
  };
}

module.exports = { buildPadelLibrary, ENGINE, FAULTS };

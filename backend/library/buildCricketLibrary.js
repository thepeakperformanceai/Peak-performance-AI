// library/buildCricketLibrary.js
// Builds library/cricket.json from docs/library/cricket.md, in the same
// format as padel (see buildLibrary.js).
//
//   node scripts/build-padel-library.js          (writes padel.json and cricket.json)
//   node scripts/build-padel-library.js --check  (fails if either JSON is out of date)
//
// The words come from cricket.md, word for word. What cricket.md can't say
// lives in ENGINE below: which engine check decides each rule and each "Why"
// version, the engine's test key, and a few PeakPerformance labels (plain
// test name, weapon headline). The "throwing arm" is the athlete's dominant
// hand on the form (the engine's racket_side_* checks).

const { buildTests } = require('./buildLibrary');

const BELOW = { type: 'score_below_target' };
const AT_GOLD = { type: 'score_at_least_target' };
const SIDE_GAP_10 = { type: 'side_gap_pct_over', pct: 10 };
const timed = { rules: [BELOW, AT_GOLD], why: [BELOW, AT_GOLD], kinds: { A: 'main', B: 'maintain' }, maintain_fix: 'B' };
const strength = {
  rules: [BELOW, SIDE_GAP_10, { type: 'otherwise' }], why: [BELOW, SIDE_GAP_10],
  kinds: { A: 'main', B: 'addon', C: 'maintain' }, maintain_fix: 'C'
};

// One entry per test, in cricket.md order.
const ENGINE = [
  { key: 'sprint_10m', plain_name: '10m sprint', measures: 'Speed', ...timed,
    weapon: { headline: 'Quick off the mark', body: 'you are quick over the first few steps' } },
  { key: 'sprint_20m', plain_name: '20m sprint', measures: 'Speed', ...timed,
    weapon: { headline: 'Quick between the wickets', body: 'you cover the length of the pitch fast' } },
  { key: 'cod_505', plain_name: '5-0-5 turn test', measures: 'Agility', ...timed,
    weapon: { headline: 'Sharp turn at the crease', body: 'you brake and turn fast' } },
  { key: 'medicine_ball', plain_name: 'medicine ball throw', measures: 'Power', ...timed,
    weapon: { headline: 'A strong arm from the deep', body: 'your upper body is powerful' } },
  { key: 'ruler_drop', plain_name: 'ruler-drop catch', measures: 'Reaction', ...timed,
    weapon: { headline: 'Safe hands close in', body: 'your reactions are sharp' } },
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
    weapon: { headline: 'A shoulder built for long spells', body: 'the back of your shoulders is strong and {evenness}', evenness: 'strength' }
  },
  { key: 'shoulder_ir', plain_name: 'arm speed strength test', measures: 'Strength', ...strength,
    weapon: { headline: 'Zip through the arm', body: 'the front of your shoulders is strong and {evenness}', evenness: 'strength' } },
  { key: 'elbow_extension', plain_name: 'elbow strength test', measures: 'Strength', ...strength,
    weapon: { headline: 'Snap through the ball', body: 'the backs of your arms are strong and {evenness}', evenness: 'strength' } },
  { key: 'hip_extension', plain_name: 'hip strength test', measures: 'Strength', ...strength,
    weapon: { headline: 'Drive from the ground', body: 'your hips are strong and {evenness}', evenness: 'strength' } }
];

/**
 * cricket.md text -> the library object. settings.draft_notice is carried
 * over from the current JSON (it's a switch, not library wording).
 */
function buildCricketLibrary(md, settings = {}) {
  const { date, tests } = buildTests(md, ENGINE, 'cricket.md');
  return {
    library_version: 'cricket-library-v1.0',
    sport: 'cricket',
    source: `docs/library/cricket.md (${date})`,
    notes: 'Built from docs/library/cricket.md by scripts/build-padel-library.js; edit cricket.md, then rebuild. Same format as the padel library. Scores come from the existing scoring engine, unchanged. Words in curly brackets are filled in by the engine from the athlete\'s results; Gemini never writes or changes these lines. plain_name, measures and weapon (headline, body, evenness) are PeakPerformance wording added for the report, not text from cricket.md.',
    draft_notice: settings.draft_notice === undefined ? 'Draft – pending clinical review' : settings.draft_notice,
    draft_notice_help: 'Shown in the footer of every page of the cricket athlete report. Set draft_notice to null (or "") to switch it off; applies to reports generated after the change. Kept when the library is rebuilt.',
    drills_label: 'Pitch drills',
    target: { score: 75, label: 'Gold', text: 'Tier target is the Gold line (score 75). Priorities are ranked by score points below 75, biggest gap first; ties keep library order.' },
    tiers: [
      { key: 'gold', label: 'Gold', min_score: 75 },
      { key: 'silver', label: 'Silver', min_score: 65 },
      { key: 'bronze', label: 'Bronze', min_score: 0 }
    ],
    plan: { weeks: 6, text: 'One combined 6-week plan: every selected fix runs from week 1. A fix shorter than 6 weeks switches to that test\'s maintain fix (where the library has one) for the remaining weeks.' },
    fault_words: {},
    tests
  };
}

module.exports = { buildCricketLibrary, ENGINE };

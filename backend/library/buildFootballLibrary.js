// library/buildFootballLibrary.js
// Builds library/football.json from docs/library/football.md, in the same
// format as padel and cricket (see buildLibrary.js).
//
//   node scripts/build-padel-library.js          (writes every sport's JSON)
//   node scripts/build-padel-library.js --check  (fails if any is out of date)
//
// The words come from football.md, word for word. ENGINE below says which
// engine check decides each rule and "Why" version; tests football shares
// with padel use padel's checks.

const { buildTests } = require('./buildLibrary');
const { ENGINE: PADEL } = require('./buildPadelLibrary');

const BELOW = { type: 'score_below_target' };
const AT_GOLD = { type: 'score_at_least_target' };
const SIDE_GAP_10 = { type: 'side_gap_pct_over', pct: 10 };
const fromPadel = (key, weapon) => ({ ...PADEL.find(e => e.key === key), ...(weapon ? { weapon } : {}) });
const strength = {
  rules: [BELOW, SIDE_GAP_10, { type: 'otherwise' }], why: [BELOW, SIDE_GAP_10],
  kinds: { A: 'main', B: 'addon', C: 'maintain' }, maintain_fix: 'C'
};

// One entry per test, in football.md order.
const ENGINE = [
  fromPadel('sprint_10m'),
  { key: 'sprint_30m', plain_name: '30m sprint', measures: 'Speed',
    rules: [BELOW, AT_GOLD], why: [BELOW, AT_GOLD], kinds: { A: 'main', B: 'maintain' }, maintain_fix: 'B',
    weapon: { headline: 'Real top speed', body: 'you have real pace over 30 metres' } },
  fromPadel('cod_505'),
  fromPadel('ruler_drop', { headline: 'First to the loose ball', body: 'your reactions are sharp' }),
  fromPadel('single_leg_stand'),
  fromPadel('trunk_rotation'),
  fromPadel('overhead_squat', { headline: 'Low and in control', body: 'your ankles, hips, upper back and shoulders work well together when you squat with your arms overhead' }),
  { key: 'hip_extension', plain_name: 'hip strength test', measures: 'Strength', ...strength,
    weapon: { headline: 'Drive from the ground', body: 'your hips are strong and {evenness}', evenness: 'strength' } },
  { key: 'knee_extension', plain_name: 'thigh strength test', measures: 'Strength', ...strength,
    weapon: { headline: 'Power in the strike', body: 'your thighs are strong and {evenness}', evenness: 'strength' } }
];

/**
 * football.md text -> the library object. settings.draft_notice is carried
 * over from the current JSON (it's a switch, not library wording).
 */
function buildFootballLibrary(md, settings = {}) {
  const { date, tests } = buildTests(md, ENGINE, 'football.md');
  return {
    library_version: 'football-library-v1.0',
    sport: 'football',
    source: `docs/library/football.md (${date})`,
    notes: 'Built from docs/library/football.md by scripts/build-padel-library.js; edit football.md, then rebuild. Same format as the padel and cricket libraries. Scores come from the existing scoring engine, unchanged. Words in curly brackets are filled in by the engine from the athlete\'s results; Gemini never writes or changes these lines. plain_name, measures and weapon (headline, body, evenness) are PeakPerformance wording added for the report, not text from football.md.',
    draft_notice: settings.draft_notice === undefined ? 'Draft – pending clinical review' : settings.draft_notice,
    draft_notice_help: 'Shown in the footer of every page of the football athlete report. Set draft_notice to null (or "") to switch it off; applies to reports generated after the change. Kept when the library is rebuilt.',
    drills_label: 'Pitch drills',
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
      back_arch: 'lower back arched'
    },
    tests
  };
}

module.exports = { buildFootballLibrary, ENGINE };

// services/padelAthleteReport.service.js
// The padel athlete report ("What it means for your game" / "How to improve").
//
//   engine scores (scoring.js) + library/padel.json
//     -> buildAthleteReport: weapons, top 3 priorities, role lines, fixes,
//        combined 6-week plan, retest date (all chosen here, in code)
//     -> narrateAthleteReport: Gemini rewords the chosen text into friendly
//        prose with the athlete's name and numbers. It never picks tests,
//        exercises or thresholds, and an answer with a number that is not in
//        its payload, or anything that looks like an exercise prescription,
//        is rejected. After MAX_ATTEMPTS the library text is used as is.
//
// Scores are the existing engine's, read as they are; nothing here changes
// how they are calculated. Ranking: score points below the Gold line (75),
// biggest gap first; ties keep library order. Left/right and ratio rules use
// the library's own percentages on the raw results. Athlete-facing gaps are
// to the NEXT tier, in the test's own units where the engine's scale can be
// read backwards.

const LIBRARY = require('../library/padel.json');
const { findUnsupportedNumbers } = require('./scoredReport.service');
const { scoreFromVald } = require('../scoring/scoring');
const aiEngine = require('./aiEngine.service');

const UNITS = {
  sprint_10m: { unit: 's', dp: 2, lowerIsBetter: true },
  cod_505: { unit: 's', dp: 2, lowerIsBetter: true },
  ruler_drop: { unit: 'cm', dp: 1, lowerIsBetter: true },
  overhead_squat: { unit: '', dp: 0 },
  trunk_rotation: { unit: '°', dp: 0 },
  single_leg_stand: { unit: 's', dp: 1 },
  shoulder_er: { unit: 'N', dp: 0 },
  hip_abduction: { unit: 'N', dp: 0 },
  hip_adduction: { unit: 'N', dp: 0 }
};

const OBSERVATIONS = { overhead_squat_fault: ['heels_knees', 'arms_back', 'clean'] };

const isSet = (v) => v !== undefined && v !== null;
const roundTo = (x, dp) => Math.round(x * 10 ** dp) / 10 ** dp;
// Smallest step in the test's units that still covers the gap.
const ceilTo = (x, dp) => Math.ceil(x * 10 ** dp - 1e-9) / 10 ** dp;
const withUnit = (v, unit) => (unit === '°' ? `${v}°` : unit ? `${v} ${unit}` : `${v}`);

// ---------- tiers ----------

const TIERS = [...LIBRARY.tiers].sort((a, b) => b.min_score - a.min_score);
const tierOf = (score) => (isSet(score) ? TIERS.find(t => score >= t.min_score) : null);
// The tier above the athlete's: Bronze -> Silver, Silver -> Gold, Gold -> none.
const nextTierOf = (score) => {
  const above = TIERS.filter(t => t.min_score > score);
  return above.length ? above[above.length - 1] : null;
};

// ---------- reading the engine's scales backwards ----------

// Raw value that scores exactly `target`, by straight-line interpolation
// between the scale's own points (xs raw, ss scores). Null outside the scale.
const invert = (xs, ss, target) => {
  for (let i = 0; i < ss.length - 1; i++) {
    const [s0, s1] = [ss[i], ss[i + 1]];
    if ((s0 <= target && target <= s1) || (s1 <= target && target <= s0)) {
      if (s1 === s0) return xs[i];
      return xs[i] + (target - s0) * (xs[i + 1] - xs[i]) / (s1 - s0);
    }
  }
  return null;
};

const valdEdges = (c) => [c[0] - (c[1] - c[0]), c[0], c[1], c[2], c[3], c[3] + (c[3] - c[2])];

/**
 * Raw result that would score `target` on this test, or null when the
 * engine's scale can't be read backwards (VALD band label only).
 */
const rawForScore = (key, target, sessionTest, cfg, timing) => {
  const tdef = cfg.tests[key];
  if (tdef.source === 'manual') {
    const pts = [...cfg.manual_anchors[key]].sort((a, b) => a[1] - b[1]);
    let raw = invert(pts.map(p => p[0]), pts.map(p => p[1]), target);
    if (raw === null) return null;
    // Hand-timed sprints are scored with the offset added; give the hand time.
    if (key.startsWith('sprint_') && timing === 'hand') raw -= cfg.hand_timing_offset_s;
    return raw;
  }
  const cutoffs = sessionTest && sessionTest.cutoffs;
  if (!cutoffs || cutoffs.length !== 4) return null;
  let edges = valdEdges(cutoffs);
  const hib = isSet(sessionTest.higher_is_better) ? sessionTest.higher_is_better : true;
  if (!hib) {
    const x = invert(edges.map(e => -e).reverse(), cfg.vald_band_edge_scores, target);
    return x === null ? null : -x;
  }
  return invert(edges, cfg.vald_band_edge_scores, target);
};

// ---------- one test's result, in words the athlete can read ----------

const resultText = (key, t) => {
  const u = UNITS[key];
  if (isSet(t.raw_left) || isSet(t.raw_right)) {
    const parts = [];
    if (isSet(t.raw_left)) parts.push(`left ${withUnit(t.raw_left, u.unit)}`);
    if (isSet(t.raw_right)) parts.push(`right ${withUnit(t.raw_right, u.unit)}`);
    return parts.join(', ');
  }
  if (key === 'overhead_squat') return `${t.raw} (HumanTrak score)`;
  return withUnit(t.raw, u.unit) + (t.timing === 'hand' ? ' (hand-timed)' : '');
};

const nextTierInfo = (key, t, sessionTest, cfg, timing) => {
  const next = nextTierOf(t.score);
  if (!next) return null;
  const u = UNITS[key];
  const points = roundTo(next.min_score - t.score, 1);
  const rawTarget = rawForScore(key, next.min_score, sessionTest, cfg, timing);
  const bilateral = isSet(t.raw_left) || isSet(t.raw_right);
  if (rawTarget === null) {
    return { tier: next.label, points, text: `${points} points from ${next.label}` };
  }
  const target = roundTo(rawTarget, u.dp);
  if (bilateral) {
    return { tier: next.label, points, rawTarget: target, text: `${next.label} starts at about ${withUnit(target, u.unit)} each side` };
  }
  // A composite score has no unit: say where the next tier starts instead.
  if (!u.unit) {
    return { tier: next.label, points, rawTarget: target, text: `${next.label} starts at a HumanTrak score of ${target}` };
  }
  const gap = ceilTo(Math.abs(t.raw - rawTarget), u.dp);
  return {
    tier: next.label, points, rawTarget: target, rawGap: gap,
    text: `${withUnit(gap, u.unit)} from ${next.label}`
  };
};

// ---------- fix selection (the library's rules, evaluated in code) ----------

// One side's score on the engine's own scale (VALD cut-offs, or the band
// midpoint when only the band was entered). Null if that side wasn't entered.
const sideScore = (side, sessionTest, cfg) => {
  const v = sessionTest[side];
  if (!isSet(v)) return null;
  if (sessionTest.cutoffs && sessionTest.cutoffs.length === 4) {
    const hib = isSet(sessionTest.higher_is_better) ? sessionTest.higher_is_better : true;
    return scoreFromVald(v, sessionTest.cutoffs, cfg, hib);
  }
  const i = cfg.vald_band_labels.indexOf(sessionTest[`band_${side}`] || sessionTest.band);
  return i === -1 ? null : cfg.vald_band_midpoints[i];
};

// Weaker side more than pct% below the stronger (both sides needed).
const gapPctOver = (a, b, pct) => isSet(a) && isSet(b) && Math.max(a, b) > 0 && Math.min(a, b) < Math.max(a, b) * (1 - pct / 100);

const conditionHolds = (when, ctx) => {
  const { t, session, cfg, observations } = ctx;
  const target = LIBRARY.target.score;
  const sides = ['left', 'right'].map(s => sideScore(s, ctx.sessionTest, cfg)).filter(isSet);
  const racket = session.athlete && session.athlete.dominant_hand === 'L' ? 'left' : session.athlete && session.athlete.dominant_hand === 'R' ? 'right' : null;
  const other = racket === 'left' ? 'right' : 'left';
  switch (when.type) {
    case 'score_below_target': return t.score < target;
    case 'score_at_least_target': return t.score >= target;
    case 'not_measured': return false;
    case 'observation': return observations[when.key] === when.equals;
    case 'either_side_below_target': return sides.length ? sides.some(s => s < target) : t.score < target;
    case 'both_sides_below_target': return sides.length === 2 && sides.every(s => s < target);
    case 'racket_side_below_target': {
      if (!racket) return false;
      const s = sideScore(racket, ctx.sessionTest, cfg);
      return isSet(s) && s < target;
    }
    case 'racket_side_weaker_pct_over':
      return !!racket && isSet(t[`raw_${racket}`]) && isSet(t[`raw_${other}`]) &&
        t[`raw_${racket}`] < t[`raw_${other}`] * (1 - when.pct / 100);
    case 'side_gap_pct_over': return gapPctOver(t.raw_left, t.raw_right, when.pct);
    case 'same_side_ratio_below': {
      const den = ctx.byName[when.denominator];
      if (!den || den.status !== 'completed') return false;
      return ['left', 'right'].some(s => isSet(t[`raw_${s}`]) && isSet(den[`raw_${s}`]) && den[`raw_${s}`] > 0 &&
        t[`raw_${s}`] / den[`raw_${s}`] < when.ratio);
    }
    case 'otherwise': return false;
    default: throw new Error(`library rule type "${when.type}" is not known to the engine`);
  }
};

// Every rule that holds; the "otherwise" rule only when none does.
const selectFixes = (entry, ctx) => {
  if (entry.needs_observation && !isSet(ctx.observations[entry.needs_observation])) {
    return { rules: [], pending: entry.missing_observation_text };
  }
  let rules = entry.rules.filter(r => r.when.type !== 'otherwise' && conditionHolds(r.when, ctx));
  if (!rules.length) rules = entry.rules.filter(r => r.when.type === 'otherwise');
  return { rules, pending: null };
};

const linesFor = (side, block) =>
  LIBRARY.sides[side].lines.map(who => ({ who, label: LIBRARY.line_labels[who], text: block[who] }));

// ---------- the combined 6-week plan ----------

const buildPlan = (priorities, side) => {
  const total = LIBRARY.plan.weeks;
  const mainWeeks = priorities.flatMap(p => p.fixes.filter(f => f.kind === 'main' && f.weeks).map(f => Math.min(f.weeks, total)));
  const ends = [...new Set([...mainWeeks.filter(w => w < total), total])].sort((a, b) => a - b);

  const phases = [];
  let from = 1;
  for (const to of ends) {
    const blocks = [];
    for (const p of priorities) {
      const entry = LIBRARY.tests.find(e => e.key === p.key);
      const main = p.fixes.filter(f => f.kind === 'main');
      const running = main.filter(f => !f.weeks || f.weeks >= to);
      let use = running.length ? [...running, ...p.fixes.filter(f => f.kind === 'addon')] : [];
      // Selected maintain fix (e.g. "Strong and balanced") runs throughout.
      use.push(...p.fixes.filter(f => f.kind === 'maintain'));
      // A finished fix switches to the test's maintain fix, if it has one.
      if (main.length && !running.length && entry.maintain_fix && !use.some(f => f.key === entry.maintain_fix)) {
        const m = entry.fixes[entry.maintain_fix];
        use.push({ key: entry.maintain_fix, ...m, switchedFrom: main.map(f => f.title) });
      }
      for (const f of use) {
        blocks.push({ test: p.name, key: p.key, fix: f.key, title: f.title, kind: f.kind, frequency: f.frequency || null,
          ...(f.switchedFrom ? { switchedFrom: f.switchedFrom } : {}), exercises: f.exercises });
      }
    }
    // The same exercise from two fixes is done once.
    const seen = new Map();
    const deduped = blocks.map(b => ({
      ...b,
      exercises: b.exercises.filter(ex => {
        if (seen.has(ex)) { seen.get(ex).alsoFor.add(b.test); return false; }
        const item = { text: ex, alsoFor: new Set() };
        seen.set(ex, item);
        return true;
      }).map(ex => seen.get(ex))
    }));
    phases.push({
      from, to,
      label: from === to ? `Week ${from}` : `Weeks ${from}–${to}`,
      blocks: deduped.map(b => ({ ...b, exercises: b.exercises.map(e => ({ text: e.text, alsoFor: [...e.alsoFor].filter(n => n !== b.test) })) }))
        .filter(b => b.exercises.length)
    });
    from = to + 1;
  }

  const drills = [];
  for (const p of priorities) {
    const entry = LIBRARY.tests.find(e => e.key === p.key);
    for (const l of linesFor(side, entry.role_drills)) {
      const hit = drills.find(d => d.text === l.text);
      if (hit) hit.tests.push(p.name);
      else drills.push({ ...l, tests: [p.name] });
    }
  }
  return { weeks: total, phases, roleDrills: drills };
};

const addWeeks = (isoDate, weeks) => {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
};

// ---------- the report ----------

/**
 * Everything the report shows, chosen in code from the engine's scores and
 * the library. profile: { name, position (LEFT/RIGHT/BOTH), testDate }.
 */
const buildAthleteReport = ({ profile, scored, session, cfg }) => {
  const side = LIBRARY.sides[profile.position] ? profile.position : 'BOTH';
  const observations = (session && session.observations) || {};
  const timing = session && session.timing_method;
  const byName = Object.fromEntries(scored.tests.map(t => [t.name, t]));

  const results = LIBRARY.tests
    .map((entry, order) => ({ entry, order, t: byName[entry.key] }))
    .filter(r => r.t && r.t.status === 'completed' && isSet(r.t.score))
    .map(r => {
      const sessionTest = session.tests[r.entry.key];
      const tier = tierOf(r.t.score);
      return {
        ...r,
        view: {
          key: r.entry.key,
          name: r.entry.name,
          measures: r.entry.measures,
          result: resultText(r.entry.key, r.t),
          score: r.t.score,
          tier: tier.label,
          nextTier: nextTierInfo(r.entry.key, r.t, sessionTest, cfg, timing)
        }
      };
    });

  // Weapons: the two best scores (ties: library order).
  const weapons = [...results].sort((a, b) => b.t.score - a.t.score || a.order - b.order).slice(0, 2);
  const weaponKeys = new Set(weapons.map(w => w.entry.key));

  // Priorities: biggest gap in score points below the target, top 3.
  const target = LIBRARY.target.score;
  const ranked = results
    .filter(r => !weaponKeys.has(r.entry.key) && r.t.score < target)
    .sort((a, b) => (target - b.t.score) - (target - a.t.score) || a.order - b.order)
    .slice(0, 3);

  const priorities = ranked.map((r, i) => {
    const ctx = { t: r.t, key: r.entry.key, sessionTest: session.tests[r.entry.key] || {}, session, byName, cfg, observations };
    const { rules, pending } = selectFixes(r.entry, ctx);
    const fixes = rules.map(rule => ({ key: rule.fix, rule: rule.text, ...(rule.proposed ? { proposed: true } : {}), ...r.entry.fixes[rule.fix] }));
    return {
      rank: i + 1,
      ...r.view,
      gapToTarget: roundTo(target - r.t.score, 1),
      whatWeMeasured: r.entry.what_we_measured,
      lines: linesFor(side, r.entry.role_lines),
      fixes,
      coachNotes: rules.map(rule => rule.coach_note).filter(Boolean),
      ...(pending ? { fixPending: pending } : {}),
      retestWeeks: r.entry.retest_weeks,
      retestNote: r.entry.retest_note
    };
  });

  // Retest: when the longest of the chosen fixes ends (all tests done if no priorities).
  const windows = (priorities.length ? priorities : results.map(r => ({ retestWeeks: r.entry.retest_weeks }))).map(p => p.retestWeeks);
  const retestWeeks = windows.length ? Math.max(...windows) : LIBRARY.plan.weeks;

  const tested = new Set(results.map(r => r.entry.key));
  const inBattery = (e) => !!cfg.tests[e.key];
  return {
    libraryVersion: LIBRARY.library_version,
    configVersion: scored.config_version,
    athleteName: profile.name,
    firstName: String(profile.name || '').trim().split(/\s+/)[0] || 'Athlete',
    side: { key: side, label: LIBRARY.sides[side].label },
    target: { score: target, label: LIBRARY.target.label },
    weapons: weapons.map(w => ({ ...w.view, whatWeMeasured: w.entry.what_we_measured })),
    priorities,
    plan: buildPlan(priorities, side),
    retest: { weeks: retestWeeks, date: addWeeks(profile.testDate, retestWeeks) },
    notTested: LIBRARY.tests.filter(e => inBattery(e) && !tested.has(e.key)).map(e => e.name),
    // Library tests the scoring engine doesn't score yet (e.g. 5-0-5): never ranked.
    notInBattery: LIBRARY.tests.filter(e => !inBattery(e)).map(e => e.name),
    rebuild: { ...LIBRARY.rebuild }
  };
};

// ---------- Gemini: words only ----------

const MAX_ATTEMPTS = 3;

const SYSTEM_PROMPT = `You are a padel coach at PeakPerformance.pk rewording an athlete's report into friendly, encouraging prose.

The tests, results, gaps and role lines in the payload were chosen in code. Your job is words only.

RULES (all mandatory):
1. Use only numbers present in the payload, copied exactly. Never compute, round, estimate or invent a number.
2. Never add, name or suggest an exercise, drill, set, rep, hold or training load. Never change which tests are weapons or priorities, or their order.
3. Address the athlete by their first name (payload.first_name) and speak to them as "you".
4. For each weapon, say in one or two sentences what the result means for their game. Mention the raw result.
5. For each priority, rewrite its role lines (lines[]) into two or three sentences for this athlete, keeping their meaning. Mention the raw result and the next-tier gap text (next_tier) exactly as given. Do not drop a role line.
6. No diagnoses, injuries or injury predictions; describe weaknesses as things to build.
7. Plain English. No markdown.

Return ONLY one JSON object, no markdown, in exactly this shape:
{
  "weapons": ["one string per weapon, same order"],
  "priorities": ["one string per priority, same order"],
  "planIntro": "one or two sentences introducing the 6-week plan and the retest date"
}`;

// What Gemini sees: only the chosen text and the athlete's numbers.
const buildNarrationPayload = (ar) => ({
  first_name: ar.firstName,
  playing_side: ar.side.label,
  weapons: ar.weapons.map(w => ({ test: w.name, result: w.result, tier: w.tier })),
  priorities: ar.priorities.map(p => ({
    test: p.name,
    result: p.result,
    tier: p.tier,
    next_tier: p.nextTier ? p.nextTier.text : null,
    lines: p.lines.map(l => `${l.label}: ${l.text}`)
  })),
  plan: { weeks: ar.plan.weeks, retest_weeks: ar.retest.weeks, retest_date: ar.retest.date }
});

// Anything that reads like a prescription is not Gemini's to write.
const PRESCRIPTION = /\b(?:sets?|reps?|repetitions?|holds?|rounds?)\s+of\b|\b\d+\s*(?:x|×)\s*\d+|\b\d+\s+(?:sets|reps|repetitions|holds|rounds)\b/i;

const stripFences = (text) => {
  let t = String(text || '').replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first !== -1 && last > first) t = t.slice(first, last + 1);
  return t;
};

const problemsWith = (prose, payload) => {
  const out = [];
  if (!Array.isArray(prose.weapons) || prose.weapons.length !== payload.weapons.length) out.push(`weapons must have ${payload.weapons.length} strings`);
  if (!Array.isArray(prose.priorities) || prose.priorities.length !== payload.priorities.length) out.push(`priorities must have ${payload.priorities.length} strings`);
  if (typeof prose.planIntro !== 'string' || !prose.planIntro.trim()) out.push('planIntro is missing');
  if (out.length) return out;
  const strings = [...prose.weapons, ...prose.priorities, prose.planIntro];
  if (strings.some(s => typeof s !== 'string' || !s.trim())) out.push('every string must have text');
  const bad = findUnsupportedNumbers({ strings }, payload);
  if (bad.length) out.push(`it used numbers that are not in the payload: ${bad.join(', ')}`);
  if (strings.some(s => PRESCRIPTION.test(s))) out.push('it wrote an exercise prescription (sets, reps, holds or rounds); exercises are not yours to write');
  return out;
};

// The library's own words, used when Gemini is unavailable or rejected.
const libraryProse = (ar) => ({
  weapons: ar.weapons.map(w => `${w.name}: ${w.result}. ${w.tier} level.`),
  priorities: ar.priorities.map(p =>
    `${p.name}: ${p.result}${p.nextTier ? ` (${p.nextTier.text})` : ''}. ${p.lines.map(l => `${l.label}: ${l.text}`).join(' ')}`),
  planIntro: `Your ${ar.plan.weeks}-week plan combines the fixes for your top priorities. Retest on ${ar.retest.date}.`
});

/**
 * Adds ar.prose (Gemini's wording, or the library's text) and returns ar.
 * Never throws for a bad or missing AI answer: the report still goes out.
 */
const narrateAthleteReport = async (ar, { callModel = aiEngine.callGemini } = {}) => {
  const payload = buildNarrationPayload(ar);
  const base = `Reword this padel athlete report.\n\nPAYLOAD:\n${JSON.stringify(payload, null, 2)}`;
  let prompt = base;
  let lastProblem = '';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let raw;
    try {
      raw = await callModel(SYSTEM_PROMPT, prompt);
    } catch (e) {
      lastProblem = `AI call failed: ${e.message}`;
      break;
    }
    let parsed;
    try {
      parsed = JSON.parse(stripFences(raw));
    } catch (e) {
      lastProblem = 'the answer was not valid JSON';
      prompt = `${base}\n\nYour previous answer was not valid JSON. Return only the JSON object.`;
      continue;
    }
    const prose = {
      weapons: Array.isArray(parsed.weapons) ? parsed.weapons.map(s => String(s ?? '').trim()) : null,
      priorities: Array.isArray(parsed.priorities) ? parsed.priorities.map(s => String(s ?? '').trim()) : null,
      planIntro: typeof parsed.planIntro === 'string' ? parsed.planIntro.trim() : ''
    };
    const problems = problemsWith(prose, payload);
    if (!problems.length) {
      ar.prose = { ...prose, source: 'gemini', attempts: attempt };
      return ar;
    }
    lastProblem = problems.join('; ');
    console.warn(`[padel report] Gemini attempt ${attempt} rejected: ${lastProblem}`);
    prompt = `${base}\n\nYour previous answer was rejected because ${problems.join('; and ')}. Rewrite it.`;
  }
  ar.prose = { ...libraryProse(ar), source: 'library', reason: lastProblem };
  return ar;
};

/** Optional tester observations kept with the session (overhead squat fault). */
const cleanObservations = (raw = {}) => {
  const out = {};
  for (const [k, allowed] of Object.entries(OBSERVATIONS)) {
    if (raw && allowed.includes(raw[k])) out[k] = raw[k];
  }
  return out;
};

module.exports = {
  LIBRARY,
  SYSTEM_PROMPT,
  OBSERVATIONS,
  tierOf,
  nextTierOf,
  rawForScore,
  buildAthleteReport,
  buildNarrationPayload,
  narrateAthleteReport,
  libraryProse,
  cleanObservations,
  problemsWith
};

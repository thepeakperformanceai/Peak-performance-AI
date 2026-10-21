// services/padelAthleteReport.service.js
// The padel athlete report: "What it means for your game", "How to improve"
// and "Your full results". One version for every player (no playing side).
//
//   engine scores (scoring.js) + library/padel.json (built from padel.md)
//     -> buildAthleteReport: weapons, top 3 priorities, the fixes, the
//        combined 6-week plan, court drills and retest date (all chosen
//        here, in code). Each priority shows the library's nickname,
//        "You'll notice it when…", the "Why" version(s) whose rule matches
//        the result, and "Fix it and…". Words in {curly brackets} are
//        filled from the engine's results: whole numbers rounded as the OVR
//        card rounds, left/right in words, the squat fault in plain words.
//     -> coachProse: the coach's own sentences (weapon line, plan intro).
//     -> narrateAthleteReport: Gemini only polishes coachProse. It never
//        sees or changes the library lines, and never picks tests,
//        exercises or thresholds; an answer with a number not in its
//        payload, an exercise prescription or a device name is rejected,
//        and after MAX_ATTEMPTS the coach text is used.
//
// Scores are the existing engine's, read as they are; nothing here changes
// how they are calculated. Ranking: score points below the Gold line (75),
// biggest gap first; ties keep library order. Left/right and ratio rules use
// the library's own percentages on the raw results.

const LIBRARY = require('../library/padel.json');
const { findUnsupportedNumbers } = require('./scoredReport.service');
const { scoreFromVald, scoreFromPercentile, pyRound } = require('../scoring/scoring');
const aiEngine = require('./aiEngine.service');
const { FAULTS } = require('../library/buildPadelLibrary');

// Timed tests are shown in their own units; every other test as its score
// out of 99, so no device units (newtons, composite scores) reach the athlete.
const MANUAL_UNITS = {
  sprint_10m: { word: 'seconds', dp: 2 },
  cod_505: { word: 'seconds', dp: 2 },
  ruler_drop: { word: 'cm', dp: 1 }
};

// "Fault seen" on the overhead squat (the two combined values are from older reports).
const OBSERVATIONS = { overhead_squat_fault: [...FAULTS, 'heels_knees', 'arms_back'] };

const isSet = (v) => v !== undefined && v !== null;
const roundTo = (x, dp) => Math.round(x * 10 ** dp) / 10 ** dp;
// Smallest step in the test's units that still covers the gap.
const ceilTo = (x, dp) => Math.ceil(x * 10 ** dp - 1e-9) / 10 ** dp;
const points = (n) => `${n} point${n === 1 ? '' : 's'}`;
const joinList = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const longDate = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

// ---------- tiers ----------

const TIERS = [...LIBRARY.tiers].sort((a, b) => b.min_score - a.min_score);
// The score the athlete sees: a whole number, rounded exactly as the OVR card
// rounds its OVR and stats. Tiers and gaps are worked out from this number.
const shownScore = (t) => pyRound(t.score);

const tierOf = (score) => (isSet(score) ? TIERS.find(t => score >= t.min_score) : null);
// The tier above the athlete's: Bronze -> Silver, Silver -> Gold, Gold -> none.
const nextTierOf = (score) => {
  const above = TIERS.filter(t => t.min_score > score);
  return above.length ? above[above.length - 1] : null;
};

// ---------- reading a timed test's scale backwards ----------

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

/** Raw time or distance that would score `target` on a timed test (null for other tests). */
const rawForScore = (key, target, cfg, timing) => {
  const tdef = cfg.tests[key];
  if (!tdef || tdef.source !== 'manual' || !cfg.manual_anchors[key]) return null;
  const pts = [...cfg.manual_anchors[key]].sort((a, b) => a[1] - b[1]);
  let raw = invert(pts.map(p => p[0]), pts.map(p => p[1]), target);
  if (raw === null) return null;
  // Hand-timed sprints are scored with the offset added; give the hand time.
  if (key.startsWith('sprint_') && timing === 'hand') raw -= cfg.hand_timing_offset_s;
  return raw;
};

// ---------- one test's result, as a coach would say it ----------

// The one number the athlete sees: a time or distance, or a score out of 99.
const plainNumber = (key, t) => {
  const u = MANUAL_UNITS[key];
  if (u) return { value: `${t.raw} ${u.word}${t.timing === 'hand' ? ' (hand-timed)' : ''}`, isScore: false };
  return { value: String(shownScore(t)), isScore: true };
};

// How even left and right are, in the test's own words from the library
// ("almost even, left vs right", "steadier on your left leg by 24%").
const evenness = (t, words) => {
  if (!words) return '';
  const l = t.raw_left, r = t.raw_right;
  if (!isSet(l) || !isSet(r) || Math.max(l, r) <= 0) return words.one_side;
  const pct = Math.round((1 - Math.min(l, r) / Math.max(l, r)) * 100);
  if (pct < 5) return words.even;
  if (pct <= 10) return words.fair;
  return words.uneven.replace('{side}', l > r ? 'left' : 'right').replace('{pct}', pct);
};

// "You scored 60 on the overhead squat. Silver starts at 65, so you're 5 points away."
const scoreLineOf = (entry, t, cfg, timing) => {
  const u = MANUAL_UNITS[entry.key];
  const first = u
    ? `Your ${entry.plain_name} was ${t.raw} ${u.word}${t.timing === 'hand' ? ' (hand-timed)' : ''}.`
    : `You scored ${shownScore(t)} on the ${entry.plain_name}.`;
  const next = nextTierOf(shownScore(t));
  if (!next) return { text: `${first} That's ${tierOf(shownScore(t)).label} level.`, nextTier: null };
  const pts = next.min_score - shownScore(t);
  const rawTarget = u ? rawForScore(entry.key, next.min_score, cfg, timing) : null;
  if (rawTarget === null) {
    return { text: `${first} ${next.label} starts at ${next.min_score}, so you're ${points(pts)} away.`, nextTier: { tier: next.label, points: pts } };
  }
  const target = roundTo(rawTarget, u.dp);
  const gap = ceilTo(Math.abs(t.raw - rawTarget), u.dp);
  return {
    text: `${first} ${next.label} starts at ${target} ${u.word}, so you're ${gap} ${u.word} away.`,
    nextTier: { tier: next.label, points: pts, rawTarget: target, rawGap: gap }
  };
};

// ---------- fix selection (the library's rules, evaluated in code) ----------

// One side's score on the engine's own scale, in the engine's order: VALD
// cut-offs (older reports), VALD's percentile, or the band midpoint when only
// the band was entered. Null if that side wasn't entered or isn't rated.
const sideScore = (side, sessionTest, cfg) => {
  const v = sessionTest[side];
  if (!isSet(v)) return null;
  if (sessionTest.cutoffs && sessionTest.cutoffs.length === 4) {
    const hib = isSet(sessionTest.higher_is_better) ? sessionTest.higher_is_better : true;
    return scoreFromVald(v, sessionTest.cutoffs, cfg, hib);
  }
  const pct = sessionTest[`percentile_${side}`];
  if (isSet(pct)) return scoreFromPercentile(pct, cfg);
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
    case 'observation': return (when.in || [when.equals]).includes(observations[when.key]);
    case 'observation_missing': return !isSet(observations[when.key]);
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
    // Timed both ways (5-0-5): the slower foot more than pct% slower than the faster.
    case 'slower_side_pct_over':
      return isSet(t.raw_left) && isSet(t.raw_right) && Math.min(t.raw_left, t.raw_right) > 0 &&
        Math.max(t.raw_left, t.raw_right) > Math.min(t.raw_left, t.raw_right) * (1 + when.pct / 100);
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
    const missing = entry.why.find(w => w.when.type === 'observation_missing');
    return { rules: [], pending: missing ? missing.text : null };
  }
  let rules = entry.rules.filter(r => r.when.type !== 'otherwise' && conditionHolds(r.when, ctx));
  if (!rules.length) rules = entry.rules.filter(r => r.when.type === 'otherwise');
  return { rules, pending: null };
};


// ---------- the combined 6-week plan ----------

const buildPlan = (priorities) => {
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

  // Court drills for the priorities, each listed once.
  const drills = [];
  for (const p of priorities) {
    const entry = LIBRARY.tests.find(e => e.key === p.key);
    for (const text of entry.court_drills) {
      const hit = drills.find(d => d.text === text);
      if (hit) hit.tests.push(p.name);
      else drills.push({ text, tests: [p.name] });
    }
  }
  return { weeks: total, phases, courtDrills: drills };
};

const addWeeks = (isoDate, weeks) => {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
};

// ---------- "Why": the library's lines, filled with the athlete's numbers ----------

const racketSide = (session) =>
  (session.athlete && session.athlete.dominant_hand === 'L' ? 'left' : session.athlete && session.athlete.dominant_hand === 'R' ? 'right' : null);
const pct = (x) => pyRound(x * 100);

// The placeholder values for one "Why" version, from the engine's results.
const whyValues = (when, template, ctx) => {
  const { entry, t, session, byName, cfg, observations, timing } = ctx;
  const u = MANUAL_UNITS[entry.key];
  const v = {};
  if (u) v.time = v.distance = `${t.raw} ${u.word}${t.timing === 'hand' ? ' (hand-timed)' : ''}`;

  // Tier gap from the shown score (the racket arm's own score for its rule).
  let score = shownScore(t);
  if (when.type === 'racket_side_below_target') score = pyRound(sideScore(racketSide(session), ctx.sessionTest, cfg));
  v.score = score;
  const next = nextTierOf(score);
  if (next) {
    v.next_tier = next.label;
    const rawTarget = u ? rawForScore(entry.key, next.min_score, cfg, timing) : null;
    if (rawTarget !== null) {
      v.target = `${roundTo(rawTarget, u.dp)} ${u.word}`;
      v.gap = `${ceilTo(Math.abs(t.raw - rawTarget), u.dp)} ${u.word}`;
    } else if (/\{gap\} points/.test(template)) {
      v.target = next.min_score;
      v.gap = next.min_score - score;
    } else {
      v.target = `a score of ${next.min_score}`;
      v.gap = points(next.min_score - score);
    }
  }

  const l = t.raw_left, r = t.raw_right;
  // Time held: the weaker leg's (or the one leg entered).
  const held = [l, r].filter(isSet);
  if (held.length) v.seconds = pyRound(Math.min(...held));
  if (when.type === 'side_gap_pct_over' && isSet(l) && isSet(r)) {
    v.weaker_side = l < r ? 'left' : 'right';
    v.gap = pct(1 - Math.min(l, r) / Math.max(l, r));
  }
  if (when.type === 'slower_side_pct_over' && isSet(l) && isSet(r)) {
    v.weaker_side = l > r ? 'left' : 'right';                          // the slower foot
    v.gap = pct(Math.max(l, r) / Math.min(l, r) - 1);
  }
  if (when.type === 'racket_side_weaker_pct_over') {
    const k = racketSide(session);
    const o = k === 'left' ? 'right' : 'left';
    v.gap = pct(1 - t[`raw_${k}`] / t[`raw_${o}`]);
  }
  if (when.type === 'same_side_ratio_below') {
    const den = byName[when.denominator];
    const sides = ['left', 'right'].filter(s => isSet(t[`raw_${s}`]) && isSet(den[`raw_${s}`]) && den[`raw_${s}`] > 0);
    v.ratio = Math.min(...sides.map(s => pct(t[`raw_${s}`] / den[`raw_${s}`])));
  }
  if (when.type === 'observation') v.fault = LIBRARY.fault_words[observations[when.key]];
  return v;
};

// Every "Why" version whose rule matches the result, filled in. A line that
// would still show a {placeholder} is held back rather than printed.
const whyLines = (ctx) => ctx.entry.why
  .filter(w => conditionHolds(w.when, ctx))
  .map(w => {
    const v = whyValues(w.when, w.text, ctx);
    return w.text.replace(/\{(\w+)\}/g, (m, k) => (isSet(v[k]) ? String(v[k]) : m));
  })
  .filter(line => {
    if (!/\{\w+\}/.test(line)) return true;
    console.warn(`[padel report] ${ctx.entry.key}: Why line not filled, left out: ${line}`);
    return false;
  });

// ---------- the report ----------

/**
 * Everything the report shows, chosen in code from the engine's scores and
 * the library. profile: { name, testDate } (playing side is not used).
 */
const buildAthleteReport = ({ profile, scored, session, cfg }) => {
  const observations = (session && session.observations) || {};
  const timing = session && session.timing_method;
  const byName = Object.fromEntries(scored.tests.map(t => [t.name, t]));

  const results = LIBRARY.tests
    .map((entry, order) => ({ entry, order, t: byName[entry.key] }))
    .filter(r => r.t && r.t.status === 'completed' && isSet(r.t.score))
    .map(r => {
      const line = scoreLineOf(r.entry, r.t, cfg, timing);
      return {
        ...r,
        view: {
          key: r.entry.key,
          name: r.entry.name,
          plainName: r.entry.plain_name,
          measures: r.entry.measures,
          number: plainNumber(r.entry.key, r.t),
          score: shownScore(r.t),
          tier: tierOf(shownScore(r.t)).label,
          scoreLine: line.text,
          nextTier: line.nextTier
        }
      };
    });

  // Weapons: the two best scores (ties: library order).
  const weapons = [...results].sort((a, b) => b.t.score - a.t.score || a.order - b.order).slice(0, 2);
  const weaponKeys = new Set(weapons.map(w => w.entry.key));

  // Priorities: biggest gap in score points below the target, top 3.
  const target = LIBRARY.target.score;
  const ranked = results
    .filter(r => !weaponKeys.has(r.entry.key) && shownScore(r.t) < target)
    .sort((a, b) => (target - b.t.score) - (target - a.t.score) || a.order - b.order)
    .slice(0, 3);

  const priorities = ranked.map((r, i) => {
    const ctx = { entry: r.entry, t: r.t, key: r.entry.key, sessionTest: session.tests[r.entry.key] || {}, session, byName, cfg, observations, timing };
    const { rules, pending } = selectFixes(r.entry, ctx);
    const why = whyLines(ctx);
    const fixes = rules.map(rule => ({ key: rule.fix, rule: rule.text, ...(rule.proposed ? { proposed: true } : {}), ...r.entry.fixes[rule.fix] }));
    return {
      rank: i + 1,
      ...r.view,
      gapToTarget: target - shownScore(r.t),
      whatWeMeasured: r.entry.what_we_measured,
      // The four athlete-facing parts, from the library, in this order.
      nickname: r.entry.nickname,
      notice: `You'll notice it when ${r.entry.notice}`,
      // When no "Why" version matches (e.g. a clean squat that still scored low), the plain score line.
      why: why.length ? why : [r.view.scoreLine],
      fixIt: `Fix it and ${r.entry.fix_it}`,
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
  const retestDate = addWeeks(profile.testDate, retestWeeks);

  const tested = new Set(results.map(r => r.entry.key));
  const inBattery = (e) => !!cfg.tests[e.key];

  // "Your full results": one plain line per test that was actually done, with
  // the library's "Fix it and…" line under it.
  const fullResults = results.map(r => ({
    key: r.entry.key,
    test: r.entry.plain_name.charAt(0).toUpperCase() + r.entry.plain_name.slice(1),
    result: r.view.number.isScore ? `${r.view.number.value} out of 99` : r.view.number.value,
    tier: r.view.tier,
    next: r.view.nextTier
      ? `${points(r.view.nextTier.points)} from ${r.view.nextTier.tier}`
      : 'At the top tier',
    fixIt: `Fix it and ${r.entry.fix_it}`
  }));

  return {
    libraryVersion: LIBRARY.library_version,
    configVersion: scored.config_version,
    athleteName: profile.name,
    firstName: String(profile.name || '').trim().split(/\s+/)[0] || 'Athlete',
    target: { score: target, label: LIBRARY.target.label },
    weapons: weapons.map(w => ({
      ...w.view,
      nickname: w.entry.nickname,
      headline: w.entry.weapon.headline,
      body: w.entry.weapon.body.replace('{evenness}', evenness(w.t, w.entry.weapon.evenness))
    })),
    priorities,
    fullResults,
    plan: buildPlan(priorities),
    retest: { weeks: retestWeeks, date: retestDate, dateText: longDate(retestDate) },
    // For staff only: never shown to the athlete (athletes only see what was tested).
    notTested: LIBRARY.tests.filter(e => inBattery(e) && !tested.has(e.key)).map(e => e.name),
    // Footer on every page while the library is under clinical review (library: draft_notice).
    draftNotice: LIBRARY.draft_notice || null
  };
};

// ---------- the coach's words (complete without Gemini) ----------

/**
 * The coach's own sentences, from the athlete's name and numbers. This is the
 * report's text whenever Gemini is unavailable or rejected, and the text
 * Gemini is asked to polish. The library lines (nickname, notice, Why, Fix
 * it) are not part of it: they are always printed as filled in by the engine.
 */
const coachProse = (ar) => {
  const name = ar.firstName;
  const n = ar.priorities.length;
  return {
    weapons: ar.weapons.map(w => `${name}, ${w.body}.`),
    planIntro: n
      ? `${name}, this plan trains your top ${n === 1 ? 'priority' : `${n} priorities`} together: ${joinList(ar.priorities.map(p => p.plainName.replace(/ test$/, '')))}. Stick with it for ${ar.plan.weeks} weeks, then we retest on ${ar.retest.dateText} to measure how far you've moved.`
      : `${name}, nothing is below Gold right now. Keep training, and we retest on ${ar.retest.dateText}.`
  };
};

// ---------- Gemini: polish only ----------

const MAX_ATTEMPTS = 3;

const SYSTEM_PROMPT = `You are a padel coach at PeakPerformance.pk polishing the wording of an athlete's report.

Every piece of text in the payload is already complete and correct. It was chosen and written in code. Your job is only to make it read more warmly and naturally, like a coach talking to this athlete.

RULES (all mandatory):
1. Use only numbers present in the payload, copied exactly. Never compute, round, estimate or invent a number.
2. Never add, name or suggest an exercise, drill, set, rep, hold or training load. Never change which tests are weapons or priorities, or their order.
3. Keep every fact from coach_text. Don't drop anything; don't add claims.
4. Address the athlete by their first name (payload.first_name) and speak to them as "you".
5. Never mention testing devices or brands (no "HumanTrak", "Dynamo" or "VALD") and never use newtons or other device units.
6. No diagnoses, injuries or injury predictions; describe weaknesses as things to build.
7. Plain English. No markdown. Keep each text about as long as its coach_text.

Return ONLY one JSON object, no markdown, in exactly this shape:
{
  "weapons": ["polished coach_text for each weapon, same order"],
  "planIntro": "polished plan.intro"
}`;

// What Gemini sees: only the coach's sentences and the athlete's numbers.
const buildNarrationPayload = (ar) => {
  const plain = coachProse(ar);
  return {
    first_name: ar.firstName,
    weapons: ar.weapons.map((w, i) => ({ test: w.plainName, headline: w.headline, result: w.number.value, coach_text: plain.weapons[i] })),
    plan: { weeks: ar.plan.weeks, retest_date: ar.retest.dateText, intro: plain.planIntro }
  };
};

// Anything that reads like a prescription is not Gemini's to write.
const PRESCRIPTION = /\b(?:sets?|reps?|repetitions?|holds?|rounds?)\s+of\b|\b\d+\s*(?:x|×)\s*\d+|\b\d+\s+(?:sets|reps|repetitions|holds|rounds)\b/i;
// No device names or device units in anything the athlete reads.
const DEVICE_WORDS = /\b(?:humantrak|dynamo|vald|newtons?)\b|\d\s*N\b/i;

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
  if (typeof prose.planIntro !== 'string' || !prose.planIntro.trim()) out.push('planIntro is missing');
  if (out.length) return out;
  const strings = [...prose.weapons, prose.planIntro];
  if (strings.some(s => typeof s !== 'string' || !s.trim())) out.push('every string must have text');
  const bad = findUnsupportedNumbers({ strings }, payload);
  if (bad.length) out.push(`it used numbers that are not in the payload: ${bad.join(', ')}`);
  if (strings.some(s => PRESCRIPTION.test(s))) out.push('it wrote an exercise prescription (sets, reps, holds or rounds); exercises are not yours to write');
  if (strings.some(s => DEVICE_WORDS.test(s))) out.push('it named a testing device or a device unit (HumanTrak, Dynamo, VALD, newtons)');
  return out;
};

/**
 * Adds ar.prose and returns ar: Gemini's polish when it passes every check,
 * otherwise the coach text built in code. Never throws for a bad or missing
 * AI answer: the report still goes out, and still reads like a coach.
 */
const narrateAthleteReport = async (ar, { callModel = aiEngine.callGemini } = {}) => {
  const payload = buildNarrationPayload(ar);
  const base = `Polish the wording of this padel athlete report.\n\nPAYLOAD:\n${JSON.stringify(payload, null, 2)}`;
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
  ar.prose = { ...coachProse(ar), source: 'coach', reason: lastProblem };
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
  coachProse,
  DEVICE_WORDS,
  cleanObservations,
  problemsWith
};

// services/padelAthleteReport.service.js
// The padel athlete report ("What it means for your game" / "How to improve").
//
//   engine scores (scoring.js) + library/padel.json
//     -> buildAthleteReport: weapons, top 3 priorities, role lines, fixes,
//        combined 6-week plan, retest date (all chosen here, in code)
//     -> coachProse: full coach sentences from the athlete's name, numbers
//        and the library lines; the report reads well with this alone.
//     -> narrateAthleteReport: Gemini only polishes that text. It never
//        picks tests, exercises or thresholds; an answer with a number not
//        in its payload, an exercise prescription or a device name is
//        rejected, and after MAX_ATTEMPTS the coach text is used.
//
// Scores are the existing engine's, read as they are; nothing here changes
// how they are calculated. Ranking: score points below the Gold line (75),
// biggest gap first; ties keep library order. Left/right and ratio rules use
// the library's own percentages on the raw results. Athlete-facing gaps are
// to the NEXT tier: in seconds or cm for timed tests, in score points for
// the rest. No device names or device units reach the athlete.

const LIBRARY = require('../library/padel.json');
const { findUnsupportedNumbers } = require('./scoredReport.service');
const { scoreFromVald } = require('../scoring/scoring');
const aiEngine = require('./aiEngine.service');

// Timed tests are shown in their own units; every other test as its score
// out of 99, so no device units (newtons, composite scores) reach the athlete.
const MANUAL_UNITS = {
  sprint_10m: { word: 'seconds', dp: 2 },
  cod_505: { word: 'seconds', dp: 2 },
  ruler_drop: { word: 'cm', dp: 1 }
};

const OBSERVATIONS = { overhead_squat_fault: ['heels_knees', 'arms_back', 'clean'] };

const isSet = (v) => v !== undefined && v !== null;
const roundTo = (x, dp) => Math.round(x * 10 ** dp) / 10 ** dp;
// Smallest step in the test's units that still covers the gap.
const ceilTo = (x, dp) => Math.ceil(x * 10 ** dp - 1e-9) / 10 ** dp;
const points = (n) => `${n} point${n === 1 ? '' : 's'}`;
const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const joinList = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const longDate = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

// ---------- tiers ----------

const TIERS = [...LIBRARY.tiers].sort((a, b) => b.min_score - a.min_score);
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
  return { value: String(t.score), isScore: true };
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
    : `You scored ${t.score} on the ${entry.plain_name}.`;
  const next = nextTierOf(t.score);
  if (!next) return { text: `${first} That's ${tierOf(t.score).label} level.`, nextTier: null };
  const pts = roundTo(next.min_score - t.score, 1);
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

const OWN_LINE = { RIGHT: 'drive', LEFT: 'reves', BOTH: 'every' };
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

// ---------- rule sentences ----------

// A plain sentence for a left/right or ratio rule that fired, from the
// rule's note template in the library; null when the rule has none.
const ruleNote = (rule, ctx) => {
  if (!rule.note) return null;
  const { t, session, byName } = ctx;
  const fill = (vars) => rule.note.replace(/\{(\w+)\}/g, (_, k) => vars[k]);
  const when = rule.when;
  if (when.type === 'side_gap_pct_over') {
    const weaker = t.raw_left < t.raw_right ? 'left' : 'right';
    const stronger = weaker === 'left' ? 'right' : 'left';
    const pct = Math.round((1 - t[`raw_${weaker}`] / t[`raw_${stronger}`]) * 100);
    return fill({ weaker, stronger, pct });
  }
  if (when.type === 'racket_side_weaker_pct_over') {
    const racket = session.athlete.dominant_hand === 'L' ? 'left' : 'right';
    const other = racket === 'left' ? 'right' : 'left';
    return fill({ pct: Math.round((1 - t[`raw_${racket}`] / t[`raw_${other}`]) * 100) });
  }
  if (when.type === 'same_side_ratio_below') {
    const den = byName[when.denominator];
    const ratios = ['left', 'right']
      .filter(s => isSet(t[`raw_${s}`]) && isSet(den[`raw_${s}`]) && den[`raw_${s}`] > 0)
      .map(s => ({ side: s, ratio: t[`raw_${s}`] / den[`raw_${s}`] }))
      .sort((a, b) => a.ratio - b.ratio);
    const low = ratios[0];
    return fill({ side: low.side, pct: Math.round(low.ratio * 100), target: Math.round(when.ratio * 100) });
  }
  return null;
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
      const line = scoreLineOf(r.entry, r.t, cfg, timing);
      return {
        ...r,
        view: {
          key: r.entry.key,
          name: r.entry.name,
          plainName: r.entry.plain_name,
          measures: r.entry.measures,
          number: plainNumber(r.entry.key, r.t),
          score: r.t.score,
          tier: tierOf(r.t.score).label,
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
      ruleNotes: rules.map(rule => ruleNote(rule, ctx)).filter(Boolean),
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

  // Every test in the library: the athlete's result, what it means for their
  // game (their side's library lines) and what a better score changes on court.
  const testByTest = LIBRARY.tests.map(entry => {
    const r = results.find(x => x.entry.key === entry.key);
    const lines = linesFor(side, entry.role_lines);
    const status = r ? 'scored' : inBattery(entry) ? 'not_tested' : 'not_in_report';
    return {
      key: entry.key,
      name: entry.name,
      plainName: entry.plain_name,
      status,
      ...(r ? { score: r.t.score, tier: r.view.tier, scoreLine: r.view.scoreLine } : {}),
      statusLine: status === 'not_tested' ? 'Not tested this session.' : status === 'not_in_report' ? 'Not part of this report yet.' : null,
      meaning: lines.map(l => asSentence(l, lines.length > 1)).join(' '),
      improveTitle: r && r.t.score >= target ? 'What it gives you on court' : r ? 'What a better score gets you' : 'Why it matters',
      improve: LIBRARY.sides[side].lines.map(who => entry.improve[who]).join(' ')
    };
  });
  return {
    libraryVersion: LIBRARY.library_version,
    configVersion: scored.config_version,
    athleteName: profile.name,
    firstName: String(profile.name || '').trim().split(/\s+/)[0] || 'Athlete',
    side: { key: side, label: LIBRARY.sides[side].label },
    target: { score: target, label: LIBRARY.target.label },
    weapons: weapons.map(w => ({
      ...w.view,
      headline: w.entry.weapon.headline,
      body: w.entry.weapon.body.replace('{evenness}', evenness(w.t, w.entry.weapon.evenness)),
      // The athlete's own line for this test (Every player when they play both sides).
      line: linesFor(side, w.entry.role_lines).find(l => l.who === OWN_LINE[side])
    })),
    priorities,
    testByTest,
    plan: buildPlan(priorities, side),
    retest: { weeks: retestWeeks, date: retestDate, dateText: longDate(retestDate) },
    notTested: LIBRARY.tests.filter(e => inBattery(e) && !tested.has(e.key)).map(e => e.name),
    // Library tests the scoring engine doesn't score yet (e.g. 5-0-5): never ranked.
    notInBattery: LIBRARY.tests.filter(e => !inBattery(e)).map(e => e.name),
    rebuild: { ...LIBRARY.rebuild }
  };
};

// ---------- the coach's words (complete without Gemini) ----------

// A library line as part of a sentence: "On the drive side, you cover ...".
const LINE_LEAD = { drive: 'On the drive side, ', reves: 'On the revés side, ' };
const asSentence = (l, many) => {
  const text = l.text.replace(/^They /, 'These muscles ');
  if (l.who === 'every') return `${many ? 'And for every player, ' : 'For every player, '}${lowerFirst(text)}`;
  return `${LINE_LEAD[l.who]}${lowerFirst(text)}`;
};
const withName = (name, sentences) => `${name}, ${lowerFirst(sentences[0])}${sentences.length > 1 ? ` ${sentences.slice(1).join(' ')}` : ''}`;

/**
 * Full coach sentences from the athlete's name, their numbers and the
 * library lines. This is the report's text whenever Gemini is unavailable
 * or rejected, and the text Gemini is asked to polish.
 */
const coachProse = (ar) => {
  const name = ar.firstName;
  const n = ar.priorities.length;
  return {
    weapons: ar.weapons.map(w => withName(name, [`${w.body.charAt(0).toUpperCase()}${w.body.slice(1)}.`, asSentence(w.line, false)])),
    priorities: ar.priorities.map(p => withName(name, [...p.ruleNotes, ...p.lines.map(l => asSentence(l, p.lines.length > 1))])),
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
3. Keep every fact and every role line's meaning from coach_text. Don't drop anything; don't add claims.
4. Address the athlete by their first name (payload.first_name) and speak to them as "you".
5. Never mention testing devices or brands (no "HumanTrak", "Dynamo" or "VALD") and never use newtons or other device units.
6. No diagnoses, injuries or injury predictions; describe weaknesses as things to build.
7. Plain English. No markdown. Keep each text about as long as its coach_text.

Return ONLY one JSON object, no markdown, in exactly this shape:
{
  "weapons": ["polished coach_text for each weapon, same order"],
  "priorities": ["polished coach_text for each priority, same order"],
  "planIntro": "polished plan.intro"
}`;

// What Gemini sees: only the chosen text and the athlete's numbers.
const buildNarrationPayload = (ar) => {
  const plain = coachProse(ar);
  return {
    first_name: ar.firstName,
    playing_side: ar.side.label,
    weapons: ar.weapons.map((w, i) => ({ test: w.plainName, headline: w.headline, result: w.number.value, coach_text: plain.weapons[i] })),
    priorities: ar.priorities.map((p, i) => ({ test: p.plainName, score_line: p.scoreLine, coach_text: plain.priorities[i] })),
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
  if (!Array.isArray(prose.priorities) || prose.priorities.length !== payload.priorities.length) out.push(`priorities must have ${payload.priorities.length} strings`);
  if (typeof prose.planIntro !== 'string' || !prose.planIntro.trim()) out.push('planIntro is missing');
  if (out.length) return out;
  const strings = [...prose.weapons, ...prose.priorities, prose.planIntro];
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

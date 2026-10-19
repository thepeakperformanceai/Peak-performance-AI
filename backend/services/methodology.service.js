// services/methodology.service.js
// "How your OVR is calculated": the public methodology for each sport and
// the personal breakdown of one report.
//
// Everything here is generated from the files the engine itself uses
// (scoring/<sport>_v1.json, the custom-assessment builder, card_tiers.json).
// Nothing comes from Gemini, and the only hand-written text is the plain
// wording in scoring/methodology_text.json (words, no numbers). The worked
// example is produced by running the engine. methodology.test.js fails if
// the explanation and the engine ever disagree.

const { loadConfig, scoreSession, pyRound } = require('../scoring/scoring');
const { ALL_TEST_INFO } = require('./scoredReport.service');
const { buildCustomConfig, manualLibrary, MANUAL_TESTS } = require('./customAssessment.service');
const TEXT = require('../scoring/methodology_text.json');
const TIERS = require('../scoring/card_tiers.json');

const SPORTS = {
  football: 'Football',
  padel: 'Padel',
  cricket: 'Cricket',
  custom: 'Custom Assessment'
};
const STAT_ORDER = ['speed', 'power', 'agility', 'endurance', 'balance', 'reaction'];
const STAT_LABELS = { speed: 'Speed', power: 'Power', agility: 'Agility', endurance: 'Endurance', balance: 'Balance', reaction: 'Reaction' };
const BAND_TEXT = { well_below: 'Well below', below: 'Below', within_normal: 'Within normal', slightly_above: 'Slightly above', well_above: 'Well above' };

const pct = (part, whole) => (whole ? pyRound(part / whole * 100, 1) : 0);
const r1 = (x) => pyRound(x, 1);
const info = (key, extra = {}) => extra[key] || ALL_TEST_INFO[key] || MANUAL_TESTS[key] || { label: key, unit: '' };

// Plain-language notes: padel / cricket from their configs; football from
// methodology_text.json (its config mirrors the Python engine's).
const notesFor = (sport, cfg) => (sport === 'football' ? TEXT.football.notes : cfg.notes || '');
const isInterim = (sport, cfg) => /^interim/i.test(notesFor(sport, cfg));

// ---------- citations (stored in each sport config, next to the numbers) ----------
// A test's "citation" in the config is "interim", "pending", "vald_norms",
// {"basis": "vald_norms", "test_reference": "<id>"} or
// {"basis": "study", "reference": "<id>"}; references live in the config's
// "references" block. Anything missing or unknown is shown as interim (manual
// tests) or VALD norms (VALD tests): a study is never named unless the config
// cites it.
const INTERIM_LABEL = 'Interim benchmark – citation being finalised';
const VALD_LABEL = 'VALD normative data, matched by age and sex';
const PENDING_LABEL = 'No agreed benchmark yet – recorded, not scored';

const formatReference = (r) =>
  `${r.authors} (${r.year}). ${r.title}. ${r.journal}` +
  `${r.volume ? `, ${r.volume}${r.issue ? `(${r.issue})` : ''}` : ''}${r.pages ? `, ${String(r.pages).replace('-', '–')}` : ''}.`;

const referenceOf = (cfg, id) => {
  const r = id && cfg.references && cfg.references[id];
  return r ? { id, ...r, text: formatReference(r) } : null;
};

const citationOf = (cfg, tdef) => {
  const c = tdef.citation;
  const basis = typeof c === 'string' ? c : c && c.basis;
  if (tdef.source !== 'manual') {
    const testReference = referenceOf(cfg, c && c.test_reference);
    return { basis: 'vald', label: VALD_LABEL, ...(testReference ? { testReference } : {}) };
  }
  if (tdef.benchmark_pending || basis === 'pending') return { basis: 'pending', label: PENDING_LABEL };
  if (basis === 'study') {
    const reference = referenceOf(cfg, c.reference);
    if (reference) return { basis: 'study', label: reference.text, reference };
  }
  // Interim anchors borrowed from another sport say so (football and padel 5-0-5: cricket's).
  const from = c && c.borrowed_from;
  if (from) return { basis: 'interim', label: `${INTERIM_LABEL} (reused from ${from[0].toUpperCase()}${from.slice(1)} until ${cfg.sport} norms are agreed)`, borrowedFrom: from };
  return { basis: 'interim', label: INTERIM_LABEL };
};

// ---------- pieces shared by every sport ----------

const higherIsBetter = (anchors) => {
  const pts = [...anchors].sort((a, b) => a[1] - b[1]);
  return pts[pts.length - 1][0] > pts[0][0];
};

/** One test, as the methodology page shows it. */
const describeTest = (key, tdef, cfg, { sport, testInfo = {}, benchmarkFrom = null } = {}) => {
  const i = info(key, testInfo);
  const out = {
    key,
    label: i.label,
    unit: i.unit,
    what: TEXT.tests[key] || null,
    device: tdef.source === 'manual' ? 'Manual' : tdef.dynamo ? 'Dynamo' : 'HumanTrak',
    stat: tdef.stat || null,
    statWeight: tdef.stat ? tdef.stat_weight : null,
    feedsOvr: !!tdef.stat,
    bothSides: !!tdef.bilateral,
    plausible: tdef.plausible || null
  };
  if (tdef.source === 'manual') {
    if (tdef.benchmark_pending) {
      out.benchmark = { type: 'pending', text: 'Recorded on the card but not scored yet: there are no agreed norms for this test.' };
    } else {
      const anchors = cfg.manual_anchors[key];
      out.benchmark = {
        type: 'research',
        text: 'Compared with published research norms.',
        anchors: [...anchors].sort((a, b) => a[1] - b[1]).map(([value, score]) => ({ value, score })),
        higherIsBetter: higherIsBetter(anchors),
        ...(tdef.best_of_left_right ? { bestOfLeftRight: true } : {})
      };
    }
    // Norms (and their citation) come from the sport whose anchors are used.
    const srcCfg = benchmarkFrom ? loadConfig(benchmarkFrom) : cfg;
    out.benchmark.from = benchmarkFrom || sport;
    out.benchmark.citation = citationOf(srcCfg, benchmarkFrom ? srcCfg.tests[key] : tdef);
    out.benchmark.interim = out.benchmark.citation.basis === 'interim';
    if (key.startsWith('sprint_')) {
      out.handTimingAddSeconds = cfg.hand_timing_offset_s;
      out.handTimingReference = referenceOf(cfg, cfg.hand_timing_citation);
    }
  } else {
    out.benchmark = { type: 'vald_age_sex', text: "Compared with VALD's own bands for athletes of the same age and sex.", interim: false, citation: citationOf(cfg, tdef) };
  }
  return out;
};

/**
 * Where each benchmark comes from, one line per test, straight from the
 * config's citation: a cited study, VALD's norms (plus the test's reference
 * study where the config gives one), interim, or pending (recorded only).
 */
const benchmarkSource = ({ key, label, citation }) => ({
  key, label,
  basis: citation.basis,
  citation: citation.label,
  reference: citation.reference || null,
  testReference: citation.testReference || null
});

// Other cited parts of the method: the hand-timing correction and flag rules.
const otherReferences = (cfg, { hasSprint, flags }) => {
  const out = [];
  const hand = referenceOf(cfg, cfg.hand_timing_citation);
  if (hasSprint && hand) out.push({ key: 'hand_timing', label: `Hand-timed sprint correction (+${cfg.hand_timing_offset_s} s)`, reference: hand });
  for (const f of flags) if (f.reference) out.push({ key: `flag_${f.type}`, label: f.text, reference: f.reference });
  return out;
};

const valdBands = (cfg) => cfg.vald_band_labels.map((label, i) => ({
  key: label,
  label: BAND_TEXT[label] || label,
  scoreFrom: cfg.vald_band_edge_scores[i],
  scoreTo: cfg.vald_band_edge_scores[i + 1],
  bandOnlyScore: cfg.vald_band_midpoints[i]
}));

/** Flag rules that apply to this config, with their numbers from the config. */
const flagRules = (cfg, labelOf) => {
  const has = (k) => !!cfg.tests[k];
  const rules = [];
  const dynamo = Object.keys(cfg.tests).filter(k => cfg.tests[k].dynamo);
  if (dynamo.length || cfg.sport === 'custom') {
    rules.push({ type: 'LSI', level: 'amber', text: `Left/right strength gap: amber when the weaker side is below ${cfg.lsi.amber_below}% of the stronger side, red below ${cfg.lsi.red_below}%.`, amberBelow: cfg.lsi.amber_below, redBelow: cfg.lsi.red_below });
    rules.push({ type: 'power_cap', level: 'red', text: `If any strength gap is red, Power is capped at ${cfg.lsi.power_cap}, so one strong side can't hide a weak one.`, powerCap: cfg.lsi.power_cap });
  }
  const bilateral = Object.keys(cfg.tests).filter(k => cfg.tests[k].bilateral);
  if (bilateral.length || cfg.sport === 'custom') {
    rules.push({ type: 'one_side_only', level: 'amber', text: 'Only one side tested: scored from that side and flagged amber.' });
  }
  if (has('single_leg_stand')) rules.push({ type: 'asymmetry', level: 'amber', text: `${labelOf('single_leg_stand')}: amber if the two legs differ by more than ${cfg.flags.sls_side_diff_s} seconds.`, sideDiff: cfg.flags.sls_side_diff_s });
  if (has('trunk_rotation')) rules.push({ type: 'mobility', level: 'amber', text: `${labelOf('trunk_rotation')}: amber if either side is under ${cfg.flags.trunk_rotation_min_deg}° or the sides differ by more than ${cfg.flags.trunk_rotation_side_diff_deg}°.`, minDeg: cfg.flags.trunk_rotation_min_deg, sideDiffDeg: cfg.flags.trunk_rotation_side_diff_deg });
  if (has('overhead_squat')) rules.push({ type: 'movement_quality', level: 'amber', text: `${labelOf('overhead_squat')}: amber if VALD rates it "${BAND_TEXT[cfg.vald_band_labels[1]]}" or "${BAND_TEXT[cfg.vald_band_labels[0]]}".` });
  if ((cfg.dominant_arm_tests || []).length) {
    rules.push({ type: 'LSI', level: 'monitor', text: `When the weaker side is the dominant arm (${cfg.dominant_arm_tests.map(labelOf).join(', ')}), the gap is marked "monitor", not amber or red: this is common in ${cfg.sport === 'cricket' ? 'bowlers' : 'racket players'}.`, tests: cfg.dominant_arm_tests });
  }
  if (cfg.arm_ratio && (has(cfg.arm_ratio.numerator) && has(cfg.arm_ratio.denominator) || cfg.sport === 'custom')) {
    rules.push({ type: cfg.arm_ratio.type, level: 'amber', text: `Shoulder balance: amber if ${labelOf(cfg.arm_ratio.numerator)} on the ${cfg.sport === 'custom' ? 'dominant' : 'bowling'} arm is below ${pyRound(cfg.arm_ratio.amber_below * 100)}% of ${labelOf(cfg.arm_ratio.denominator)}.`, amberBelowPct: pyRound(cfg.arm_ratio.amber_below * 100) });
  }
  if (cfg.groin_ratio && (has(cfg.groin_ratio.numerator) && has(cfg.groin_ratio.denominator) || cfg.sport === 'custom')) {
    const reference = referenceOf(cfg, cfg.groin_ratio.citation);
    rules.push({ type: 'groin_risk', level: 'amber', text: `Groin balance: amber if ${labelOf(cfg.groin_ratio.numerator)} is below ${pyRound(cfg.groin_ratio.amber_below * 100)}% of ${labelOf(cfg.groin_ratio.denominator)}.`, amberBelowPct: pyRound(cfg.groin_ratio.amber_below * 100), ...(reference ? { reference } : {}) });
  }
  return rules;
};

const tiers = () => TIERS.tiers.map((t, i, all) => ({
  key: t.key, label: t.label, from: t.min_ovr, to: i === 0 ? cfgCap() : all[i - 1].min_ovr - 1
})).concat([{ key: TIERS.unrated.key, label: TIERS.unrated.label, from: null, to: null, meaning: TIERS.unrated.meaning }]);
const cfgCap = () => loadConfig('football').score_cap;

const ovrRules = (cfg) => ({
  minStats: cfg.ovr_min_stats,
  minWeightSharePct: pyRound(cfg.ovr_min_weight_share * 100),
  scoreFloor: cfg.score_floor,
  scoreCap: cfg.score_cap,
  provisionalUnderAge: cfg.provisional_under_age,
  provisionalSexes: cfg.provisional_sexes,
  powerCap: cfg.lsi.power_cap
});

// ---------- worked example (run through the engine) ----------

// Example inputs built from each config: manual tests at a norm anchor
// value, VALD tests with a VALD band per side. The engine scores them.
const anchorAt = (anchors, score) => (anchors.find(a => a[1] === score) || anchors[Math.floor(anchors.length / 2)])[0];

const exampleInput = (key, tdef, cfg, n) => {
  if (tdef.source === 'manual') {
    if (tdef.benchmark_pending) {
      const [lo, hi] = tdef.plausible;
      return { status: 'completed', value: r1(lo + (hi - lo) / 3) };
    }
    const target = n % 2 ? 70 : 85;
    const v = anchorAt(cfg.manual_anchors[key], target);
    // Timed both ways: the faster time (the anchor) and a slower one.
    if (tdef.best_of_left_right) return { status: 'completed', left: r1(v + 0.06), right: v };
    return { status: 'completed', value: v };
  }
  const [lo, hi] = tdef.plausible || [0, 100];
  // Strength (N) ranges are wide, so take a low point; others mid-range.
  const base = r1(lo + (hi - lo) * (tdef.dynamo ? 0.15 : tdef.bilateral ? 0.5 : 0.7));
  return tdef.bilateral
    ? { status: 'completed', left: base, right: r1(base * 0.95), band_left: 'within_normal', band_right: 'within_normal' }
    : { status: 'completed', value: base, band: 'within_normal' };
};

const workedExample = (cfg, testInfo = {}) => {
  const tests = {};
  Object.entries(cfg.tests).forEach(([k, d], n) => { tests[k] = exampleInput(k, d, cfg, n); });
  const athlete = { age: Math.max(cfg.provisional_under_age, 18) + 6, sex: 'M', position: null };
  const session = { athlete, timing_method: 'electronic', tests };
  const scored = scoreSession(session, cfg);
  return { athlete: { age: athlete.age, sex: 'male' }, timing: 'electronic gates', ...explain(scored, session, cfg, testInfo) };
};

// ---------- the explanation of one scored session ----------

const REASON_STATUS = {
  not_done: 'not done', injured: 'injured', equipment_fault: 'equipment fault',
  invalid: 'result outside the believable range', benchmark_pending: 'no norms yet (recorded only)'
};
// Engine reasons ("medicine_ball: benchmark_pending") in plain words.
const reasonText = (r, testInfo = {}) => {
  const m = /^(\w+): (\w+)$/.exec(r);
  if (m && REASON_STATUS[m[2]]) return `${info(m[1], testInfo).label}: ${REASON_STATUS[m[2]]}`;
  if (r === 'benchmarks are adult male only') return 'our norms are currently for men only';
  if (r === 'benchmarks are adult only') return 'our norms are for adults';
  return r;
};

const rawText = (t, sessionTest = {}) => {
  if (t.raw_left !== undefined || t.raw_right !== undefined) return { left: t.raw_left, right: t.raw_right };
  if (t.distance_m !== undefined) return { value: t.raw, metres: t.distance_m };
  return { value: t.raw };
};

/**
 * Breaks one engine result into the steps a parent can follow:
 * tests -> stats -> OVR. Recomputes each stat and the OVR from the test
 * scores exactly as the engine does; methodology.test.js checks they match.
 */
const explain = (scored, session, cfg, testInfo = {}) => {
  const byName = Object.fromEntries(scored.tests.map(t => [t.name, t]));
  const testRow = (name) => {
    const t = byName[name];
    const tdef = cfg.tests[name];
    const i = info(name, testInfo);
    const row = {
      key: name, label: i.label, unit: i.unit, status: t.status,
      ...rawText(t, session.tests?.[name]),
      score: t.score, partial: !!t.partial,
      benchmark: tdef.source === 'manual' ? (tdef.benchmark_pending ? 'pending' : 'research') : 'vald_age_sex'
    };
    if (t.timing === 'hand') {
      row.handTimingAddSeconds = cfg.hand_timing_offset_s;
      row.adjustedValue = pyRound(t.raw + cfg.hand_timing_offset_s, 2);
    }
    if (t.bands) row.bands = t.bands.map(b => (b === null ? null : BAND_TEXT[cfg.vald_band_labels[b]]));
    if (t.lsi !== undefined) row.lsi = t.lsi;
    return row;
  };

  // Stats: weighted average of the scored tests that feed each one.
  const stats = [];
  const statValue = {};
  for (const stat of STAT_ORDER.filter(s => s in cfg.stat_weights)) {
    const feeders = Object.keys(cfg.tests).filter(n => cfg.tests[n].stat === stat);
    const withScore = feeders.filter(n => byName[n].score !== null);
    const wsum = withScore.reduce((a, n) => a + cfg.tests[n].stat_weight, 0);
    let exact = wsum ? withScore.reduce((a, n) => a + byName[n].score * cfg.tests[n].stat_weight, 0) / wsum : null;
    const engine = scored.stats[stat];
    const capped = !!engine?.capped;
    if (capped) exact = cfg.lsi.power_cap;
    statValue[stat] = exact;
    stats.push({
      key: stat, label: STAT_LABELS[stat], description: TEXT.stats[stat],
      value: exact === null ? null : pyRound(exact), exact: exact === null ? null : r1(exact),
      status: engine?.status || (exact === null ? 'not_tested' : 'scored'),
      partial: !!engine?.partial, capped,
      ovrWeight: cfg.stat_weights[stat],
      tests: feeders.map(n => ({
        ...testRow(n),
        weightInStat: cfg.tests[n].stat_weight,
        shareOfStatPct: byName[n].score !== null && wsum ? pct(cfg.tests[n].stat_weight, wsum) : null
      }))
    });
  }

  // OVR: weighted average of the stats that have a value.
  const avail = stats.filter(s => s.exact !== null);
  const aw = avail.reduce((a, s) => a + cfg.stat_weights[s.key], 0);
  const totalW = Object.values(cfg.stat_weights).reduce((a, b) => a + b, 0);
  const enough = avail.length >= cfg.ovr_min_stats && aw / totalW >= cfg.ovr_min_weight_share;
  const ovrExact = enough ? avail.reduce((a, s) => a + statValue[s.key] * cfg.stat_weights[s.key], 0) / aw : null;
  for (const s of stats) {
    if (s.exact === null || !enough) { s.shareOfOvrPct = null; s.pointsInOvr = null; continue; }
    s.shareOfOvrPct = pct(cfg.stat_weights[s.key], aw);
    s.pointsInOvr = r1(statValue[s.key] * cfg.stat_weights[s.key] / aw);
  }

  return {
    stats,
    flatTests: Object.keys(cfg.tests).filter(n => !cfg.tests[n].stat).map(testRow),   // tests that only flag
    ovr: {
      value: enough ? pyRound(ovrExact) : null,
      exact: enough ? r1(ovrExact) : null,
      statsScored: avail.length,
      minStats: cfg.ovr_min_stats,
      weightCoveredPct: pct(aw, totalW),
      minWeightSharePct: pyRound(cfg.ovr_min_weight_share * 100),
      provisional: !!scored.ovr.provisional,
      reasons: (scored.ovr.reasons || []).map(r => reasonText(r, testInfo))
    },
    flags: (scored.flags || []).map(f => ({ ...f, test: info(f.test, testInfo).label }))
  };
};

// ---------- public methodology ----------

const sportMethodology = (sport) => {
  const cfg = loadConfig(sport);
  const labelOf = (k) => info(k).label;
  const tests = Object.entries(cfg.tests).map(([k, d]) => describeTest(k, d, cfg, { sport }));
  const totalW = Object.values(cfg.stat_weights).reduce((a, b) => a + b, 0);
  const stats = STAT_ORDER.map(s => {
    const feeders = tests.filter(t => t.stat === s);
    const wsum = feeders.reduce((a, t) => a + t.statWeight, 0);
    return {
      key: s, label: STAT_LABELS[s], description: TEXT.stats[s],
      ovrWeight: cfg.stat_weights[s], ovrWeightPct: pct(cfg.stat_weights[s], totalW),
      inBattery: !cfg.stats_not_in_battery.includes(s) && feeders.length > 0,
      tests: feeders.map(t => ({ key: t.key, label: t.label, weight: t.statWeight, sharePct: pct(t.statWeight, wsum) }))
    };
  });
  return {
    sport, name: SPORTS[sport], configVersion: cfg.config_version,
    interim: isInterim(sport, cfg), notes: notesFor(sport, cfg),
    tests, stats,
    benchmarkSources: tests.map(t => benchmarkSource({ key: t.key, label: t.label, citation: t.benchmark.citation })),
    otherReferences: otherReferences(cfg, { hasSprint: tests.some(t => t.key.startsWith('sprint_')), flags: flagRules(cfg, labelOf) }),
    flagOnlyTests: tests.filter(t => !t.feedsOvr).map(t => t.key),
    valdBands: valdBands(cfg),
    ovr: ovrRules(cfg),
    flags: flagRules(cfg, labelOf),
    tiers: tiers(),
    workedExample: workedExample(cfg)
  };
};

const customMethodology = () => {
  // The same builder the custom report uses, on an example test list.
  const lib = manualLibrary('football');
  const example = buildCustomConfig({
    testsIn: [
      { key: 'sprint_10m', kind: 'manual' }, { key: 'cod_505', kind: 'manual' }, { key: 'ruler_drop', kind: 'manual' },
      { key: 'knee_extension', kind: 'vald', valdKey: 'dynamo:kneeextension', bilateral: true }
    ],
    benchmarkSport: 'football'
  });
  const cfg = example.cfg;
  const labelOf = (k) => info(k).label;
  const manualTests = lib.map(t => {
    const from = loadConfig(t.benchmarkFrom);
    const citation = citationOf(from, from.tests[t.key]);
    return {
      key: t.key, label: t.label, unit: t.unit, what: TEXT.tests[t.key] || null, stat: t.stat,
      normsFrom: SPORTS[t.benchmarkFrom], pending: t.benchmarkPending,
      interim: citation.basis === 'interim', citation,
      handTimingAddSeconds: t.key.startsWith('sprint_') ? cfg.hand_timing_offset_s : null
    };
  });
  return {
    sport: 'custom', name: SPORTS.custom, configVersion: cfg.config_version,
    interim: true,
    notes: 'A custom assessment uses the tests chosen for that session. Manual tests use the same research norms as our sport batteries (interim where those are interim); VALD tests use VALD\'s age-and-sex bands.',
    manualTests,
    benchmarkSources: manualTests
      .map(t => benchmarkSource({ key: t.key, label: `${t.label} (${t.normsFrom} norms)`, citation: t.citation }))
      .concat([benchmarkSource({ key: 'vald', label: 'VALD tests (Dynamo, HumanTrak)', citation: citationOf(cfg, { source: 'vald' }) })]),
    otherReferences: otherReferences(cfg, { hasSprint: true, flags: flagRules(cfg, labelOf) }),
    statRule: 'VALD tests count towards the stat chosen for them in our VALD test mapping (standard battery tests keep their usual stat, for example Knee Extension counts towards Power). VALD tests with no stat are shown on the report but not scored. Inside a stat, every test counts equally.',
    statWeights: STAT_ORDER.map(s => ({ key: s, label: STAT_LABELS[s], description: TEXT.stats[s], ovrWeight: cfg.stat_weights[s] })),
    valdBands: valdBands(cfg),
    ovr: ovrRules(cfg),
    flags: flagRules(cfg, labelOf),
    tiers: tiers(),
    workedExample: workedExample(cfg, example.testInfo)
  };
};

const methodology = (sport) => {
  if (sport === 'custom') return customMethodology();
  if (!SPORTS[sport]) {
    const err = new Error('Unknown sport');
    err.statusCode = 404;
    throw err;
  }
  return sportMethodology(sport);
};

// ---------- personal breakdown of one saved report ----------

const sportOfReport = (report) => (report.footballSession ? 'football' : report.scoringSport || null);

/** The breakdown of one saved, engine-scored report (null for older AI reports). */
const reportBreakdown = (report) => {
  const sport = sportOfReport(report);
  const scored = report.scoring;
  const session = report.footballSession || report.scoringSession;
  if (!sport || !scored || !session) return null;
  const cfg = sport === 'custom' ? report.scoringConfig : loadConfig(sport);
  if (!cfg) return null;
  const rc = report.reportContent || {};
  return {
    sport, sportName: SPORTS[sport],
    athleteName: report.athleteName,
    testDate: report.testDate,
    configVersion: scored.config_version,
    // Benchmarks may have changed since this report was scored.
    configChangedSince: scored.config_version !== cfg.config_version,
    timing: session.timing_method,
    engineOvr: scored.ovr.value,
    methodologyPath: `/how-we-score/${sport}`,
    ...explain(scored, session, cfg, report.scoringTestInfo || {}),
    additionalVald: rc.additionalVald || []
  };
};

module.exports = { methodology, reportBreakdown, explain, workedExample, citationOf, formatReference, SPORTS, BAND_TEXT, INTERIM_LABEL, VALD_LABEL };

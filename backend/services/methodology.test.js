// Run: npm test   (from backend/)
// "How your OVR is calculated" must never disagree with the engine. These
// checks fail if the methodology pages or a personal breakdown say anything
// different from what scoring/scoring.js and the config files do.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadConfig, scoreSession, pyRound } = require('../scoring/scoring');
const { methodology, reportBreakdown, explain } = require('./methodology.service');
const { buildCustomConfig } = require('./customAssessment.service');
const TIERS = require('../scoring/card_tiers.json');

const SPORTS = ['football', 'padel', 'cricket'];

// Small seeded random generator so failures are reproducible.
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

const randomSession = (cfg, rand) => {
  const tests = {};
  for (const [k, d] of Object.entries(cfg.tests)) {
    const roll = rand();
    if (roll < 0.12) { tests[k] = { status: ['not_done', 'injured', 'equipment_fault'][Math.floor(rand() * 3)] }; continue; }
    if (d.source === 'manual') {
      if (k === 'beep_test') { const level = 3 + Math.floor(rand() * 12); tests[k] = { status: 'completed', level, shuttle: Math.floor(rand() * cfg.beep_shuttles_per_level[String(level)]) }; continue; }
      if (k === 'yoyo_ir1') { const lv = Object.keys(cfg.yoyo_shuttles_per_level); const level = Number(lv[Math.floor(rand() * lv.length)]); tests[k] = { status: 'completed', level, shuttle: 1 + Math.floor(rand() * cfg.yoyo_shuttles_per_level[String(level)]) }; continue; }
      const [lo, hi] = d.plausible;
      tests[k] = { status: 'completed', value: pyRound(lo + (hi - lo) * (rand() * 1.1 - 0.02), 2) };   // a few out of range -> invalid
      continue;
    }
    const [lo, hi] = d.plausible || [0, 100];
    const v = () => pyRound(lo + (hi - lo) * rand(), 1);
    const cut = rand() < 0.5 ? [1, 2, 3, 4].map(i => pyRound(lo + (hi - lo) * i / 5, 1)) : null;
    const band = () => cfg.vald_band_labels[Math.floor(rand() * 5)];
    if (d.bilateral) {
      const oneSide = rand() < 0.15;
      tests[k] = { status: 'completed', left: v(), ...(oneSide ? {} : { right: v() }), ...(cut ? { cutoffs: cut } : { band_left: band(), band_right: band() }) };
    } else {
      tests[k] = { status: 'completed', value: v(), ...(cut ? { cutoffs: cut } : { band: band() }) };
    }
  }
  return {
    athlete: { age: 14 + Math.floor(rand() * 20), sex: rand() < 0.3 ? 'F' : 'M', position: null, dominant_hand: rand() < 0.5 ? 'L' : 'R' },
    timing_method: rand() < 0.5 ? 'hand' : 'electronic',
    tests
  };
};

const agrees = (cfg, session, label) => {
  const scored = scoreSession(session, cfg);
  const ex = explain(scored, session, cfg);
  for (const s of ex.stats) {
    const engine = scored.stats[s.key];
    assert.equal(s.value, engine.value, `${label}: ${s.key} stat`);
    for (const t of s.tests) {
      const et = scored.tests.find(x => x.name === t.key);
      assert.equal(t.score, et.score, `${label}: ${t.key} score`);
      if (et.timing === 'hand') assert.equal(t.handTimingAddSeconds, cfg.hand_timing_offset_s);
    }
  }
  assert.equal(ex.ovr.value, scored.ovr.value, `${label}: OVR`);
  if (ex.ovr.value !== null) {
    const shares = ex.stats.filter(s => s.shareOfOvrPct !== null);
    assert.ok(Math.abs(shares.reduce((a, s) => a + s.shareOfOvrPct, 0) - 100) < 0.5, `${label}: shares add to 100%`);
    assert.ok(Math.abs(shares.reduce((a, s) => a + s.pointsInOvr, 0) - ex.ovr.exact) < 0.5, `${label}: points add to the OVR`);
  }
  assert.deepEqual(ex.flags.map(f => f.type), scored.flags.map(f => f.type), `${label}: flags`);
  return scored;
};

test('breakdown agrees with the engine on 400 random sessions per sport', () => {
  for (const sport of SPORTS) {
    const cfg = loadConfig(sport);
    const rand = rng(42 + sport.length);
    let withOvr = 0;
    for (let i = 0; i < 400; i++) {
      const scored = agrees(cfg, randomSession(cfg, rand), `${sport} #${i}`);
      if (scored.ovr.value !== null) withOvr++;
    }
    assert.ok(withOvr > 100, `${sport}: enough sessions with an OVR (${withOvr})`);
  }
});

test('breakdown agrees with the engine for custom sessions', () => {
  const rand = rng(7);
  const { cfg } = buildCustomConfig({
    testsIn: [{ key: 'sprint_10m', kind: 'manual' }, { key: 'sprint_30m', kind: 'manual' }, { key: 'cod_505', kind: 'manual' }, { key: 'ruler_drop', kind: 'manual' },
      { key: 'beep_test', kind: 'manual' }, { key: 'knee_extension', kind: 'vald', valdKey: 'dynamo:kneeextension', bilateral: true },
      { key: 'hip_adduction', kind: 'vald', valdKey: 'dynamo:hipadduction', bilateral: true }, { key: 'hip_abduction', kind: 'vald', valdKey: 'dynamo:hipabduction', bilateral: true }],
    benchmarkSport: 'padel'
  });
  for (let i = 0; i < 300; i++) agrees(cfg, randomSession(cfg, rand), `custom #${i}`);
});

test('methodology numbers are the config numbers', () => {
  for (const sport of SPORTS) {
    const cfg = loadConfig(sport);
    const m = methodology(sport);
    assert.equal(m.configVersion, cfg.config_version);
    const totalW = Object.values(cfg.stat_weights).reduce((a, b) => a + b, 0);
    for (const s of m.stats) {
      assert.equal(s.ovrWeight, cfg.stat_weights[s.key], `${sport} ${s.key} weight`);
      assert.equal(s.ovrWeightPct, pyRound(cfg.stat_weights[s.key] / totalW * 100, 1));
      assert.equal(s.inBattery, !cfg.stats_not_in_battery.includes(s.key) && s.tests.length > 0);
      for (const t of s.tests) assert.equal(t.weight, cfg.tests[t.key].stat_weight);
    }
    assert.deepEqual(m.tests.map(t => t.key), Object.keys(cfg.tests));
    for (const t of m.tests) {
      const d = cfg.tests[t.key];
      assert.equal(t.stat, d.stat || null);
      assert.deepEqual(t.plausible, d.plausible || null);
      if (t.benchmark.type === 'research') {
        assert.deepEqual(t.benchmark.anchors.map(a => [a.value, a.score]), [...cfg.manual_anchors[t.key]].sort((a, b) => a[1] - b[1]));
      }
      assert.equal(t.benchmark.type, d.source === 'manual' ? (d.benchmark_pending ? 'pending' : 'research') : 'vald_age_sex');
      if (t.key.startsWith('sprint_')) assert.equal(t.handTimingAddSeconds, cfg.hand_timing_offset_s);
    }
    assert.deepEqual(m.valdBands.map(b => [b.scoreFrom, b.scoreTo, b.bandOnlyScore]),
      cfg.vald_band_labels.map((_, i) => [cfg.vald_band_edge_scores[i], cfg.vald_band_edge_scores[i + 1], cfg.vald_band_midpoints[i]]));
    assert.equal(m.ovr.minStats, cfg.ovr_min_stats);
    assert.equal(m.ovr.minWeightSharePct, pyRound(cfg.ovr_min_weight_share * 100));
    assert.equal(m.ovr.powerCap, cfg.lsi.power_cap);
    assert.equal(m.ovr.provisionalUnderAge, cfg.provisional_under_age);
    const lsi = m.flags.find(f => f.type === 'LSI' && f.level === 'amber');
    assert.deepEqual([lsi.amberBelow, lsi.redBelow], [cfg.lsi.amber_below, cfg.lsi.red_below]);
    if (cfg.tests.single_leg_stand) assert.equal(m.flags.find(f => f.type === 'asymmetry').sideDiff, cfg.flags.sls_side_diff_s);
    if (cfg.groin_ratio) assert.equal(m.flags.find(f => f.type === 'groin_risk').amberBelowPct, pyRound(cfg.groin_ratio.amber_below * 100));
    assert.equal(m.interim, /^interim/i.test(m.notes));
  }
});

test('worked example is the engine\'s own result for the example session', () => {
  for (const sport of [...SPORTS, 'custom']) {
    const w = methodology(sport).workedExample;
    assert.ok(w.ovr.value === null || (w.ovr.value >= 25 && w.ovr.value <= 99), sport);
    assert.ok(w.stats.some(s => s.tests.length), sport);
    for (const s of w.stats) {
      if (s.value === null) continue;
      const scored = s.tests.filter(t => t.score !== null);
      const wsum = scored.reduce((a, t) => a + t.weightInStat, 0);
      if (!s.capped) assert.equal(s.value, pyRound(scored.reduce((a, t) => a + t.score * t.weightInStat, 0) / wsum), `${sport} ${s.key}`);
    }
  }
});

test('card tiers on the card match card_tiers.json', () => {
  const card = fs.readFileSync(path.join(__dirname, '../../frontend/src/components/footballCard.js'), 'utf8');
  const m = /ovr == null \? 'unrated' : ovr >= (\d+) \? 'gold' : ovr >= (\d+) \? 'silver' : 'bronze'/.exec(card);
  assert.ok(m, 'tierFor not found in footballCard.js');
  const by = Object.fromEntries(TIERS.tiers.map(t => [t.key, t.min_ovr]));
  assert.deepEqual([Number(m[1]), Number(m[2])], [by.gold, by.silver]);
  const tiers = methodology('football').tiers;
  assert.deepEqual(tiers.filter(t => t.from !== null).map(t => [t.key, t.from, t.to]), [['gold', 75, 99], ['silver', 65, 74], ['bronze', 0, 64]]);
});

test('report breakdown: from the stored engine output; old AI reports have none', () => {
  const cfg = loadConfig('padel');
  const session = randomSession(cfg, rng(99));
  const scoring = scoreSession(session, cfg);
  const b = reportBreakdown({ athleteName: 'A', testDate: '2026-10-13', scoringSport: 'padel', scoringSession: session, scoring, reportContent: {} });
  assert.equal(b.ovr.value, scoring.ovr.value);
  assert.equal(b.engineOvr, scoring.ovr.value);
  assert.equal(b.methodologyPath, '/how-we-score/padel');
  assert.equal(b.configChangedSince, false);
  assert.equal(reportBreakdown({ athleteName: 'Old', reportContent: {} }), null);
  const { cfg: ccfg, testInfo } = buildCustomConfig({ testsIn: [{ key: 'ruler_drop', kind: 'manual' }] });
  const cs = { athlete: { age: 25, sex: 'M' }, timing_method: 'electronic', tests: { ruler_drop: { status: 'completed', value: 16 } } };
  const cb = reportBreakdown({ scoringSport: 'custom', scoringConfig: ccfg, scoringTestInfo: testInfo, scoringSession: cs, scoring: scoreSession(cs, ccfg) });
  assert.equal(cb.methodologyPath, '/how-we-score/custom');
  assert.equal(cb.stats.find(s => s.key === 'reaction').tests[0].score, 70);
});

test('unknown sport is a 404', () => {
  assert.throws(() => methodology('golf'), (e) => e.statusCode === 404);
});

test('benchmark sources: a study is named only when the config cites one; otherwise interim', () => {
  for (const sport of [...SPORTS, 'custom']) {
    const m = methodology(sport);
    assert.ok(m.benchmarkSources.length, sport);
    for (const b of m.benchmarkSources) {
      assert.ok(['study', 'vald', 'interim', 'pending'].includes(b.basis), `${sport} ${b.key}`);
      if (b.basis === 'study') assert.ok(b.source, `${sport} ${b.key}`);
      if (b.basis === 'interim' || b.basis === 'pending') assert.equal(b.source, null, `${sport} ${b.key}`);
    }
    if (m.tests) {
      for (const t of m.tests) {
        const b = m.benchmarkSources.find(x => x.key === t.key);
        const expected = t.benchmark.type === 'vald_age_sex' ? 'vald' : t.benchmark.type === 'pending' ? 'pending' : t.benchmark.source ? 'study' : 'interim';
        assert.equal(b.basis, expected, `${sport} ${t.key}`);
      }
    }
  }
});

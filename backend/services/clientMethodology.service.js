// services/clientMethodology.service.js
// "How we score" for client cards (VALD machine tests only), and the
// breakdown of one saved client card. Generated from the files the scoring
// uses (machine_card_v1.json, the sport configs, card_tiers.json): every
// number here is the one the card is scored with.

const { loadConfig } = require('../scoring/scoring');
const { loadMachineConfig, generalBattery, mobilityTestsFor, throughAnchors } = require('../scoring/machineCard');
const { pyRound } = require('../scoring/scoring');
const { ALL_TEST_INFO } = require('./scoredReport.service');
const { VALD_BAND_WORDS } = require('./vald/valdHubPdf');
const TIERS = require('../scoring/card_tiers.json');

const CLIENT_PAGES = {
  'client-football': { sport: 'football', name: 'Football Client Card' },
  'client-padel': { sport: 'padel', name: 'Padel Client Card' },
  'client-cricket': { sport: 'cricket', name: 'Cricket Client Card' },
  general: { sport: 'general', name: 'General / Gym Client Card' }
};
const pageKeyOf = (sport) => (sport === 'general' ? 'general' : `client-${sport}`);

const SOURCE = "Every score comes from VALD's age- and sex-matched data: VALD compares each of your results with people of the same age and sex, as a percentile (Dynamo strength tests) or a band (HumanTrak movement tests). We put those onto the card's 25–99 scale. Nothing is estimated, and nothing is compared with athletes of one sport.";

const CARD_TEST_LABELS = {
  trunk_flexion: 'Trunk Flexion', trunk_extension: 'Trunk Extension', trunk_lateral_flexion: 'Trunk Lateral Flexion',
  arc_of_motion: 'Shoulder Arc of Motion', dorsiflexion: 'Weight Bearing Dorsiflexion', hip_rotation: 'Seated Hip IR/ER',
  single_leg_squat: 'Single Leg Squat'
};
const labelOf = (k) => CARD_TEST_LABELS[k] || ALL_TEST_INFO[k]?.label || k;

const clientMethodology = (pageKey) => {
  const page = CLIENT_PAGES[pageKey];
  if (!page) return null;
  const m = loadMachineConfig();
  const battery = page.sport === 'general' ? generalBattery(m) : loadConfig(page.sport).tests;
  const dynamo = Object.keys(battery).filter(k => battery[k].source === 'vald' && battery[k].dynamo);
  const symTests = dynamo.filter(k => m.symmetry_tests.includes(k));
  const armTests = dynamo.filter(k => m.arm_tests.includes(k));
  const pa = m.vald_percentile_anchors;
  const general = page.sport === 'general';

  return {
    kind: 'client_card',
    key: pageKey,
    sport: page.sport,
    name: page.name,
    configVersion: m.config_version,
    source: SOURCE,
    draftNotice: m.draft_notice || null,
    stats: [
      { key: 'strength', name: 'Strength', tests: dynamo.map(labelOf),
        how: `The average of every VALD percentile on these Dynamo tests (left and right), put on a straight line from ${pa[0][1]} at the ${pa[0][0]}th percentile to ${pa[pa.length - 1][1]} at the ${pa[pa.length - 1][0]}th. Example: the 50th percentile (stronger than half of people your age and sex) scores ${pyRound(throughAnchors(50, pa, m.score_floor, m.score_cap))}.` },
      { key: 'symmetry', name: 'Symmetry', tests: symTests.map(labelOf), proposed: m.symmetry.status === 'proposed', countedInOvr: !!m.symmetry.count_in_ovr,
        hidden: m.symmetry.show_on_card === false,
        how: 'For each lower-body Dynamo test (hips, knees) with both sides: your weaker side as a % of your stronger side, scored as below, then averaged. VALD gives no band for left/right differences, so this scale is ours.',
        anchors: m.symmetry.lsi_anchors.map(([lsi, score]) => ({ lsi, gapPct: 100 - lsi, score })),
        basis: m.symmetry.basis, references: m.symmetry.references, label: m.symmetry.label },
      { key: 'balance', name: 'Balance', tests: m.balance_tests.map(labelOf), how: "VALD's band (or percentile) for each side, scored at the middle of the band, then averaged. Single Leg Stand is never scored: VALD has no age- and sex-matched norms for it, so the report shows its left and right result and which leg was steadier." },
      { key: 'movement', name: 'Movement', tests: m.movement_tests.map(labelOf), how: "VALD's band, scored at the middle of the band." },
      { key: 'mobility', name: 'Mobility', tests: mobilityTestsFor(page.sport, m).map(labelOf), how: "The average of these mobility tests in your VALD report that VALD rated (other mobility tests are shown with VALD's rating, not scored): each test scores the middle of its band (the average of its sides). A test with no VALD band or percentile is shown as \"measured · not rated\" and isn't counted. Trunk Rotation is never scored." },
      { key: 'speed', name: 'Speed', locked: true, how: `${m.locked.speed}. Not part of the OVR, and not counted for the rating.` }
    ],
    bands: m.vald_band_labels.map((label, i) => ({ label: VALD_BAND_WORDS[label], score: m.vald_band_midpoints[i] })),
    arm: armTests.length
      ? { tests: armTests.map(labelOf), text: `${armTests.map(labelOf).join(', ')}: shown as ${general ? 'dominant arm' : 'playing arm'} vs other arm on the report, not scored. A difference between arms is common${general ? '' : ' in this sport'}.` }
      : null,
    ovr: { minStats: m.ovr_min_stats, of: m.stats.length,
      text: `Your OVR is the plain average of your scored stats. It needs at least ${m.ovr_min_stats} of the ${m.stats.length} stats; until then the card shows "Rating pending". A stat that isn't in your VALD report shows "--" (not tested) and is never estimated.` },
    tiers: TIERS.tiers.map(t => ({ label: t.label, minOvr: t.min_ovr })),
    text: 'The report text is chosen in code from your results. An AI may reword it to read naturally, but it is checked: it can never add a number, an exercise or advice.'
  };
};

/** Breakdown of one saved client card: each stat and what it came from. */
const clientBreakdown = (report) => {
  const card = report.scoring;
  const s = report.scoringSession;
  if (!card || !card.stats || !s?.client) return null;
  return {
    kind: 'client_card',
    sport: s.sport,
    sportName: report.reportContent?.sport,
    page: pageKeyOf(s.sport),
    methodologyPath: `/how-we-score/${pageKeyOf(s.sport)}`,
    athleteName: report.athleteName,
    testDate: report.testDate,
    configVersion: card.config_version,
    stats: Object.entries(card.stats).map(([k, v]) => ({ key: k, value: v.value, proposed: !!v.proposed, counted: card.ovr.counted.includes(k), from: v.from || [], averagePercentile: v.averagePercentile ?? null })),
    ovr: card.ovr
  };
};

module.exports = { clientMethodology, clientBreakdown, CLIENT_PAGES, pageKeyOf, SOURCE };

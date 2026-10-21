// services/scoredReport.service.js
// Reports from manually entered test results, scored by the scoring engine.
// One pipeline for every engine-scored sport (football, padel); each sport is a
// small profile below (test names, positions, prompt wording).
//
//   tester's input -> validateInput -> scoring engine (every number)
//                  -> buildGeminiPayload -> Gemini (words only)
//                  -> number check -> buildReportContent (card shape)
//
// Gemini never calculates a number: it receives the finished scores and its
// answer is rejected if it contains any number that is not in the payload.

const { scoreSession, loadConfig, STATUSES } = require('../scoring/scoring');
const aiEngine = require('./aiEngine.service');
const { VALD_BAND_WORDS, ordinal, percentileWords } = require('./vald/valdHubPdf');

const ALL_TEST_INFO = {
  sprint_10m:       { label: '10m Sprint',              unit: 's' },
  sprint_30m:       { label: '30m Sprint',              unit: 's' },
  ruler_drop:       { label: 'Ruler Drop',              unit: 'cm' },
  single_leg_stand: { label: 'Single Leg Stand (Eyes Closed)', unit: 's' },
  trunk_rotation:   { label: 'Trunk Rotation',          unit: '°' },
  overhead_squat:   { label: 'Overhead Squat',          unit: 'composite score' },
  hip_extension:    { label: 'Hip Extension',           unit: 'N' },
  knee_extension:   { label: 'Knee Extension',          unit: 'N' },
  shoulder_er:      { label: 'Shoulder External Rotation', unit: 'N' },
  hip_abduction:    { label: 'Hip Abduction',           unit: 'N' },
  hip_adduction:    { label: 'Hip Adduction',           unit: 'N' },
  sprint_20m:       { label: '20m Sprint',              unit: 's' },
  cod_505:          { label: '505 Agility',             unit: 's' },
  medicine_ball:    { label: 'Medicine Ball Throw (seated, 4 kg)', unit: 'm' },
  shoulder_ir:      { label: 'Shoulder Internal Rotation', unit: 'N' },
  elbow_extension:  { label: 'Elbow Extension',         unit: 'N' }
};

// Per-sport wording and fields. Football's strings are exactly what the
// football report has always used.
const SPORT_PROFILES = {
  football: {
    key: 'football',
    displayName: 'Football',
    batteryLabel: 'Football Battery v1',
    positions: ['GK', 'DEF', 'MID', 'FWD'],
    positionError: 'Position is required (GK, DEF, MID or FWD)',
    needsDominantHand: false,
    athleteNoun: 'football athlete',
    coachLine: 'a football coach and the athlete: plain English, specific to football',
    comparedWith: 'footballers',
    profileWhere: 'on the pitch',
    symmetryTests: 'Hip and Knee Extension',
    extraRules: []
  },
  padel: {
    key: 'padel',
    displayName: 'Padel',
    batteryLabel: 'Padel Battery v1',
    // Court side: left (revés) or right (drive).
    positions: ['LEFT', 'RIGHT', 'BOTH'],
    positionError: 'Court side is required (LEFT, RIGHT or BOTH)',
    needsDominantHand: true,
    handError: 'Dominant hand is required (L or R)',
    athleteNoun: 'padel athlete',
    coachLine: 'a padel coach and the athlete: plain English, specific to padel',
    comparedWith: 'padel players',
    profileWhere: 'on court',
    symmetryTests: 'Shoulder External Rotation, Hip Abduction and Hip Adduction',
    extraRules: [
      'A flag with level "monitor" and dominant_side_weaker true (Shoulder External Rotation) means the dominant arm is the weaker side. This is common in racket players: describe it as something to monitor, never as a problem or a red flag.',
      'A "groin_risk" flag means hip adduction strength is low relative to hip abduction (its value is adduction as a percentage of abduction). Describe it as an area to strengthen, never as an injury or injury prediction.'
    ]
  },
  cricket: {
    key: 'cricket',
    displayName: 'Cricket',
    batteryLabel: 'Cricket Battery v1',
    // Role: batter, pace bowler, spin bowler, all-rounder, wicketkeeper.
    positions: ['BAT', 'PACE', 'SPIN', 'ALL', 'WK'],
    positionError: 'Role is required (BAT, PACE, SPIN, ALL or WK)',
    needsDominantHand: true,
    handError: 'Bowling arm is required (L or R)',
    athleteNoun: 'cricketer',
    coachLine: 'a cricket coach and the athlete: plain English, specific to cricket',
    comparedWith: 'cricketers',
    profileWhere: 'on the field',
    symmetryTests: 'Shoulder External and Internal Rotation, Elbow Extension and Hip Extension',
    extraRules: [
      'A test with benchmark "pending" was measured but has no agreed benchmark yet, so it has no score. You may mention its raw result, but never rate it, score it or compare it with any norm. A stat with status "benchmark_pending" is "not scored yet: benchmarks pending", never estimated.',
      'A flag with level "monitor" and dominant_side_weaker true means the bowling arm is the weaker side. This is common in cricketers: describe it as something to monitor, never as a problem or a red flag.',
      'A "shoulder_balance" flag means external rotation strength on the bowling arm is low relative to internal rotation (its value is external as a percentage of internal). Describe it as an area to strengthen, never as an injury or injury prediction.'
    ]
  }
};

// Custom assessment: tests chosen per session, so the wording is general.
const CUSTOM_PROFILE = {
  key: 'custom',
  displayName: 'Custom Assessment',
  batteryLabel: 'Custom Assessment',
  freePosition: true,
  positions: [],
  needsDominantHand: false,
  optionalDominantHand: true,
  athleteNoun: 'athlete',
  coachLine: 'a coach and the athlete: plain English, not specific to one sport',
  comparedWith: 'other athletes in a particular sport',
  profileWhere: 'in training and competition',
  symmetryTests: 'the Dynamo strength tests in the payload',
  nullStatRule: 'This is a custom assessment: only the tests in the payload were done, so never mention tests that are not in it.',
  nullOvrRule: 'If the OVR value is null, say there is no overall rating for this custom session because too few stats were scored, and that the stats and tests still stand on their own.',
  noOvrMessage: 'No OVR: custom session',
  extraRules: []
};

const STAT_LABELS = {
  speed: 'Speed', power: 'Power', agility: 'Agility',
  endurance: 'Endurance', balance: 'Balance', reaction: 'Reaction'
};

const STATUS_LABELS = {
  completed: 'completed', not_done: 'not done', injured: 'injured',
  equipment_fault: 'equipment fault', invalid: 'invalid (value outside the plausible range)'
};

const SEXES = ['M', 'F'];
// The form's choice when VALD gave no band: measured, not rated.
const NOT_RATED = 'not_rated';
const HANDS = ['L', 'R'];
const TIMING = ['hand', 'electronic'];
const BODYWEIGHT_RANGE = [30, 160];

// "Additional VALD results": VALD tests outside the sport's battery. Shown on
// the report only — never scored, never in the OVR, never sent to Gemini.
const ADDITIONAL_STATS = ['speed', 'power', 'agility', 'balance', 'reaction', 'endurance'];
const MAX_ADDITIONAL = 60;

const cleanAdditionalVald = (rows, bandLabels) => {
  if (!Array.isArray(rows)) return [];
  const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? undefined : Math.round(Number(v) * 10) / 10);
  const str = (v, n) => String(v ?? '').trim().slice(0, n);
  const band = (v) => (bandLabels.includes(v) ? v : null);
  const pct = (v) => { const n = num(v); return n !== undefined && n >= 0 && n <= 100 ? n : null; };
  return rows.slice(0, MAX_ADDITIONAL).map(r => {
    const left = num(r?.left);
    const right = num(r?.right);
    const value = num(r?.value);
    if (left === undefined && right === undefined && value === undefined) return null;
    return {
      test: str(r.test, 160) || 'VALD test',
      device: ['Dynamo', 'HumanTrak'].includes(r.device) ? r.device : 'VALD',
      unit: str(r.unit, 20),
      ...(left !== undefined ? { left } : {}),
      ...(right !== undefined ? { right } : {}),
      ...(value !== undefined ? { value } : {}),
      // Symmetry recomputed here: smaller side as a % of the larger.
      symmetry: left !== undefined && right !== undefined && Math.max(left, right) > 0
        ? Math.round(Math.min(left, right) / Math.max(left, right) * 1000) / 10 : null,
      date: str(r.date, 10),
      stat: ADDITIONAL_STATS.includes(r.stat) ? r.stat : null,
      ...(r.source === 'vald_pdf' ? { source: 'vald_pdf' } : {}),
      ...(left !== undefined || right !== undefined
        ? { band_left: band(r.band_left), band_right: band(r.band_right) }
        : { band: band(r.band) }),
      // VALD's percentile, when the row came from a VALD Hub PDF.
      ...Object.fromEntries(['percentile_left', 'percentile_right', 'percentile']
        .map(k => [k, pct(r[k])]).filter(([, v]) => v !== null))
    };
  }).filter(Boolean);
};

const badRequest = (msg) => {
  const err = new Error(msg);
  err.statusCode = 400;
  return err;
};

// Accepts numbers or numeric strings from the form; '' / null => undefined.
const toNum = (v, field) => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  if (!Number.isFinite(n)) throw badRequest(`${field} must be a number`);
  return n;
};

// Whole years between dob and the session date.
const ageOn = (dob, onDate) => {
  let age = onDate.getUTCFullYear() - dob.getUTCFullYear();
  const m = onDate.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && onDate.getUTCDate() < dob.getUTCDate())) age--;
  return age;
};

const parseDate = (v, field) => {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) throw badRequest(`${field} must be a date (YYYY-MM-DD)`);
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw badRequest(`${field} is not a valid date`);
  return d;
};

const systemPromptFor = (sp) => {
  const rules = [
    'Use only numbers present in the payload. Never compute, adjust, estimate, average or invent any number. If you mention a number, copy it exactly as it appears in the payload. When in doubt, describe in words instead of numbers.',
    `A stat whose value is null is "not tested this session". Do not speculate on why and never estimate it. ${sp.nullStatRule ?? 'Endurance is not in the current test battery: say it was not tested this session.'} A test with raw_left and raw_right but no side bands is a timed test done both ways (for example the 505 turning off each foot): its score comes from the faster time (raw).`,
    `If ovr.provisional is true, say once, plainly, that the rating will firm up after the remaining tests. ${sp.nullOvrRule ?? 'If the OVR value is null, say the overall rating is pending until testing is complete.'}`,
    'Describe flags as areas to work on, never as diagnoses, injuries or injury predictions.',
    'If session.everything_tested is false (anything is Not tested, listed in session.not_tested), never call the session, testing, battery, assessment, profile or picture "comprehensive" or "complete". Say what was tested instead.',
    'Left/right strength (lsi) is SYMMETRY: the weaker side as a percentage of the stronger, so higher is better and 100 is perfectly even. Write it as "<lsi>% symmetry" (for example "88.9% symmetry") or as "a <lsi_gap_pct>% gap" between sides (for example "an 11.1% gap"), copying the payload numbers. An LSI flag\'s value is the same symmetry figure (its gap is gap_pct). Never write "asymmetry of <number>" or call the symmetry figure an asymmetry.',
    `Benchmark wording: tests with benchmark "research" are "compared with published international norms". Tests with benchmark "vald_age_sex" (HumanTrak and Dynamo) are "compared with others of the same age and sex". Never say a VALD result is compared with ${sp.comparedWith}.`,
    'A VALD test with vald_percentile (or vald_percentile_left / vald_percentile_right) has VALD\'s own percentile against people of the same age and sex. Say it as "stronger than <percentile>% of people your age and sex" for Dynamo strength tests, copying the number. The percentile is NOT the score: never call one the other, and never write the percentile as "/99" or "out of 99".',
    'VALD bands (vald_band, vald_band_left, vald_band_right) are VALD\'s own words: copy them as written ("Within normal", "Slightly below", ...).',
    'A test with benchmark "not_rated" is measured, not rated: VALD gave no band or percentile for it. You may mention its raw result, but never rate it, judge it, score it or compare it with any norm.',
    `Write for ${sp.coachLine}, encouraging but honest. Refer to the athlete as "the athlete" (no name is given).`,
    ...sp.extraRules
  ];
  return `You are a sports scientist at PeakPerformance.pk writing the text of a ${sp.athleteNoun}'s test report.

You receive a JSON payload of FINISHED scores. The scores were calculated in code; your job is words only.

RULES (all mandatory):
${rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}

Return ONLY one JSON object, no markdown, in exactly this shape:
{
  "playerProfile": "one line on how this profile shows up ${sp.profileWhere}",
  "summary": "2-3 sentences summarising the session",
  "stats": {
    "speed": "1-2 sentences", "power": "1-2 sentences", "agility": "1-2 sentences",
    "endurance": "1-2 sentences", "balance": "1-2 sentences", "reaction": "1-2 sentences"
  },
  "symmetry": "1-2 sentences on left/right strength balance (${sp.symmetryTests})",
  "recommendation": "1-2 sentences on what to work on next",
  "flags": ["one short sentence per flag in the payload, same order (the test name is already shown beside it)"]
}`;
};

// ---------- number check (sport-independent) ----------

// Every number written in a piece of text, as numbers (so 71 and 71.0 match).
const numbersIn = (text) => (String(text).match(/\d+(?:\.\d+)?/g) || []).map(Number);

const collectStrings = (value, out = []) => {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach(v => collectStrings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach(v => collectStrings(v, out));
  return out;
};

// Numbers in Gemini's text that do not appear anywhere in the payload.
const findUnsupportedNumbers = (narrative, payload) => {
  const allowed = new Set(numbersIn(JSON.stringify(payload)));
  const bad = new Set();
  for (const s of collectStrings(narrative)) {
    for (const n of numbersIn(s)) if (!allowed.has(n)) bad.add(n);
  }
  return [...bad];
};

// LSI is symmetry (weaker side as % of stronger); the gap is what's left.
const gapOf = (lsi) => Math.round((100 - lsi) * 10) / 10;

// Wording rules the prompt asks for, checked in code.
const COMPLETE_WORDING = /\bcomprehensive\b|\bcomplete(?:ly)?\s+(?:testing|test|tests|session|assessment|battery|profile|picture|evaluation|screen|screening|set|overview|data)\b/i;
const ASYMMETRY_NUMBER = /\basymmetr(?:y|ies)\s*(?:of|at|score|value|index|is|was|:)?\s*(?:of\s+)?\d|\d+(?:\.\d+)?\s*%?\s*asymmetr/i;
const findWordingProblems = (narrative, payload) => {
  const text = collectStrings(narrative).join('\n');
  const out = [];
  if (payload.session && !payload.session.everything_tested && COMPLETE_WORDING.test(text)) {
    out.push(`it called the session "comprehensive" or "complete" although some tests or stats were not tested (${payload.session.not_tested.join(', ')})`);
  }
  if (ASYMMETRY_NUMBER.test(text)) {
    out.push('it wrote LSI as an asymmetry number. Write it as "<lsi>% symmetry" or "a <lsi_gap_pct>% gap"');
  }
  return out;
};

const stripFences = (text) => {
  let t = String(text || '').replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  if (t[0] !== '{') {
    const first = t.indexOf('{');
    const last = t.lastIndexOf('}');
    if (first !== -1 && last > first) t = t.slice(first, last + 1);
  }
  return t;
};

const asText = (v) => (typeof v === 'string' ? v.trim() : '');

const normaliseNarrative = (raw, payload) => {
  const stats = {};
  for (const k of Object.keys(STAT_LABELS)) stats[k] = asText(raw.stats && raw.stats[k]);
  const flags = Array.isArray(raw.flags) ? raw.flags.map(asText) : [];
  return {
    playerProfile: asText(raw.playerProfile),
    summary: asText(raw.summary),
    stats,
    symmetry: asText(raw.symmetry),
    recommendation: asText(raw.recommendation),
    flags: payload.flags.map((_, i) => flags[i] || '')
  };
};

const MAX_ATTEMPTS = 3;

const fmt = (v, unit) => (v === null || v === undefined ? '—' : `${v}${unit === '°' ? '°' : ` ${unit}`}`);

const notTestedText = (status) => (status === 'completed' ? '' : `Not tested — ${STATUS_LABELS[status] || status}`);

// Tags for page 4: top two scored stats STRENGTH, lowest PRIORITY,
// others SOLID (60+) or WATCH. Missing stats are NOT TESTED.
const statTags = (stats) => {
  const scored = Object.entries(stats).filter(([, v]) => v.value !== null).sort((a, b) => b[1].value - a[1].value);
  const tags = {};
  scored.forEach(([k, v], i) => {
    if (scored.length > 1 && i === scored.length - 1) tags[k] = 'PRIORITY';
    else if (i < 2) tags[k] = 'STRENGTH';
    else tags[k] = v.value >= 60 ? 'SOLID' : 'WATCH';
  });
  return tags;
};

/**
 * Everything for one sport: validate, score, payload, Gemini, card.
 */
const forSport = (sportKey) => {
  const sp = SPORT_PROFILES[sportKey];
  if (!sp) throw new Error(`no scored-report profile for sport "${sportKey}"`);
  return makePipeline(sp, loadConfig(sportKey), ALL_TEST_INFO);
};

/**
 * Custom assessment: the same pipeline over a config built for this session
 * (services/customAssessment.service.js). testInfo labels the session's tests.
 */
const forCustom = (cfg, testInfo) => makePipeline(CUSTOM_PROFILE, cfg, { ...ALL_TEST_INFO, ...testInfo });

const makePipeline = (sp, cfg, testInfoAll) => {
  const TEST_INFO = Object.fromEntries(Object.keys(cfg.tests).map(n => [n, testInfoAll[n]]));
  const SYSTEM_PROMPT = systemPromptFor(sp);

  // Battery sections, in config order.
  const testNames = Object.keys(cfg.tests);
  const MANUAL = testNames.filter(n => cfg.tests[n].source === 'manual');
  const DYNAMO = testNames.filter(n => cfg.tests[n].dynamo);
  const MOVEMENT = testNames.filter(n => cfg.tests[n].source === 'vald' && !cfg.tests[n].dynamo);

  // ---------- input ----------

  // Turns one test's form entry into the engine's input shape.
  // Out-of-range values are passed through on purpose: the engine marks them
  // "invalid" (never a low score), exactly as the spec says.
  const cleanTest = (name, raw = {}) => {
    const tdef = cfg.tests[name];
    const label = TEST_INFO[name].label;
    const status = raw.status || 'not_done';
    if (!STATUSES.has(status)) throw badRequest(`${label}: unknown status "${status}"`);
    if (status !== 'completed') return { status };

    // Timed both ways (5-0-5 off each foot): both times kept, the faster one scored.
    if (tdef.best_of_left_right) {
      const left = toNum(raw.left, `${label} left foot`);
      const right = toNum(raw.right, `${label} right foot`);
      if (left === undefined && right === undefined) throw badRequest(`${label}: enter at least one foot's time, or change the status`);
      return { status, ...(left !== undefined ? { left } : {}), ...(right !== undefined ? { right } : {}) };
    }

    if (tdef.source === 'manual') {
      const value = toNum(raw.value, label);
      if (value === undefined) throw badRequest(`${label}: enter a value, or change the status`);
      return { status, value };
    }

    // VALD tests: read from the VALD Hub PDF (source "vald_pdf") or entered
    // by hand. Scored from VALD's own percentile or band, never cut-offs.
    const fromPdf = raw.source === 'vald_pdf';
    const out = { status, ...(fromPdf ? { source: 'vald_pdf' } : {}) };
    if (tdef.bilateral) {
      const left = toNum(raw.left, `${label} left`);
      const right = toNum(raw.right, `${label} right`);
      if (left === undefined && right === undefined) throw badRequest(`${label}: enter at least one side, or change the status`);
      if (left !== undefined) out.left = left;
      if (right !== undefined) out.right = right;
    } else {
      const value = toNum(raw.value, label);
      if (value === undefined) throw badRequest(`${label}: enter a value, or change the status`);
      out.value = value;
    }

    // The form no longer asks for cut-offs. Older callers of the API may still
    // send them for hand-entered tests; a test read from the PDF never uses them.
    const cutoffs = Array.isArray(raw.cutoffs) ? raw.cutoffs.filter(c => c !== '' && c !== null && c !== undefined) : [];
    if (fromPdf && cutoffs.length) throw badRequest(`${label}: read from the VALD PDF, so cut-offs are not used`);
    if (cutoffs.length) {
      const nums = cutoffs.map((c, i) => toNum(c, `${label} cut-off ${i + 1}`));
      if (nums.length !== 4 || nums.some((c, i) => i > 0 && c < nums[i - 1])) {
        throw badRequest(`${label}: enter all 4 VALD cut-offs, lowest first`);
      }
      out.cutoffs = nums;
      return out;
    }

    // Per side entered: VALD's age/sex-matched percentile (0-100) or band.
    const sides = tdef.bilateral
      ? [['left', 'percentile_left', 'band_left'], ['right', 'percentile_right', 'band_right']]
      : [['value', 'percentile', 'band']];
    const rated = [];
    for (const [side, pKey, bKey] of sides) {
      if (out[side] === undefined) continue;
      const p = toNum(raw[pKey], `${label} percentile`);
      if (p !== undefined) {
        if (p < 0 || p > 100) throw badRequest(`${label}: VALD percentile must be 0–100`);
        out[pKey] = p;
      } else if (raw[bKey] && raw[bKey] !== NOT_RATED) {
        if (!cfg.vald_band_labels.includes(raw[bKey])) throw badRequest(`${label}: unknown VALD band "${raw[bKey]}"`);
        out[bKey] = raw[bKey];
      }
      rated.push(out[pKey] !== undefined || out[bKey] !== undefined);
    }
    // No rating is "measured, not rated" (shown, never scored): from the PDF
    // when VALD printed none, or when the tester says VALD gave no band.
    // Otherwise every side entered needs one.
    const notRated = fromPdf ? !rated.some(Boolean) : sides.some(([, , bKey]) => raw[bKey] === NOT_RATED);
    if (notRated) {
      for (const [, pKey, bKey] of sides) { delete out[pKey]; delete out[bKey]; }
    } else if (rated.some(r => !r)) {
      throw badRequest(`${label}: enter the 4 VALD cut-offs, or the VALD band or percentile for each side entered, or choose "No band from VALD"`);
    }
    return out;
  };

  /**
   * Validates the tester's entry and returns { profile, session }.
   * resultsIn = { timingMethod, tests: {...} }
   */
  const validateInput = (profileIn = {}, resultsIn = {}) => {
    const name = String(profileIn.name || '').trim();
    if (!name) throw badRequest('Athlete name is required');
    const dob = parseDate(profileIn.dob, 'Date of birth');
    const testDateStr = profileIn.testDate || new Date().toISOString().slice(0, 10);
    const testDate = parseDate(testDateStr, 'Test date');
    const age = ageOn(dob, testDate);
    if (age < 5 || age > 80) throw badRequest('Date of birth gives an age outside 5–80 — please check it');
    if (!SEXES.includes(profileIn.sex)) throw badRequest('Sex is required (M or F)');
    // Custom assessments have no fixed positions: an optional short label.
    const position = sp.freePosition
      ? String(profileIn.position || '').trim().slice(0, 12).toUpperCase()
      : profileIn.position;
    if (!sp.freePosition && !sp.positions.includes(position)) throw badRequest(sp.positionError);
    if (sp.needsDominantHand && !HANDS.includes(profileIn.dominantHand)) {
      throw badRequest(sp.handError);
    }
    // Optional dominant hand (custom): used only by the arm-balance flag.
    const hand = sp.needsDominantHand || (sp.optionalDominantHand && HANDS.includes(profileIn.dominantHand))
      ? profileIn.dominantHand : null;
    const bodyweight = toNum(profileIn.bodyweight, 'Bodyweight');
    if (bodyweight === undefined) throw badRequest('Bodyweight is required');
    if (bodyweight < BODYWEIGHT_RANGE[0] || bodyweight > BODYWEIGHT_RANGE[1]) {
      throw badRequest(`Bodyweight must be ${BODYWEIGHT_RANGE[0]}–${BODYWEIGHT_RANGE[1]} kg — please re-check it`);
    }
    const timing = resultsIn.timingMethod;
    if (!TIMING.includes(timing)) throw badRequest('Timing method is required (hand or electronic)');

    const testsIn = resultsIn.tests || {};
    const tests = {};
    for (const testName of testNames) tests[testName] = cleanTest(testName, testsIn[testName]);
    if (!Object.values(tests).some(t => t.status === 'completed')) {
      throw badRequest('Enter at least one completed test');
    }

    const profile = {
      name,
      dob: profileIn.dob,
      age,
      sex: profileIn.sex,
      position,
      ...(hand ? { dominantHand: hand } : {}),
      bodyweight: Math.round(bodyweight * 10) / 10,
      testDate: testDateStr,
      trainingLevel: profileIn.trainingLevel,
      knownInjuries: profileIn.knownInjuries || '',
      practitioner: profileIn.practitioner || 'Not specified',
      customParams: profileIn.customParams || {},
      additionalVald: cleanAdditionalVald(resultsIn.additionalVald, cfg.vald_band_labels)
    };
    const session = {
      athlete: {
        id: profileIn.athleteId || null, age, sex: profile.sex, position: profile.position,
        ...(hand ? { dominant_hand: hand } : {})
      },
      timing_method: timing,
      tests
    };
    return { profile, session };
  };

  // ---------- Gemini payload ----------

  // Engine arrays hold one entry per side entered (left first): -> [left, right].
  const sidePairs = (t, arr) => {
    const hasL = t.raw_left !== null && t.raw_left !== undefined;
    const hasR = t.raw_right !== null && t.raw_right !== undefined;
    return [hasL ? arr[0] ?? null : null, hasR ? arr[hasL ? 1 : 0] ?? null : null];
  };

  // VALD's own wording for a band index ("Within normal", "Slightly below").
  const bandLabel = (i) => (i === null || i === undefined ? null : VALD_BAND_WORDS[cfg.vald_band_labels[i]] || cfg.vald_band_labels[i]);

  const reasonText = (reason) => {
    const m = /^(\w+): (\w+)$/.exec(reason);
    if (m && TEST_INFO[m[1]] && m[2] === 'benchmark_pending') return `${TEST_INFO[m[1]].label}: benchmarks pending`;
    if (m && TEST_INFO[m[1]] && m[2] === 'not_rated') return `${TEST_INFO[m[1]].label}: measured, not rated`;
    if (m && TEST_INFO[m[1]]) return `${TEST_INFO[m[1]].label} not completed: ${STATUS_LABELS[m[2]] || m[2]}`;
    return reason;
  };

  // The spec's payload shape: finished scores with readable test names and
  // units. The athlete's name is not sent — Gemini doesn't need it.
  const buildGeminiPayload = (scored, session) => {
    const tests = scored.tests.map(t => {
      const info = TEST_INFO[t.name];
      const tdef = cfg.tests[t.name];
      const out = { name: info.label, status: t.status };
      if (t.status !== 'completed') return out;
      if (t.raw_left !== undefined || t.raw_right !== undefined) {
        if (t.raw_left !== null) out.raw_left = t.raw_left;
        if (t.raw_right !== null) out.raw_right = t.raw_right;
        // Timed both ways: the faster time is the one scored.
        if (tdef.best_of_left_right) out.raw = t.raw;
      } else {
        out.raw = t.raw;
      }
      out.unit = info.unit;
      if (t.timing) out.timing = t.timing;
      out.benchmark = t.benchmark;
      if (t.bands && t.bands.some(b => b !== null)) {
        const labels = t.bands.map(bandLabel);
        if (labels.length === 1) out.vald_band = labels[0];
        else { out.vald_band_left = labels[0]; out.vald_band_right = labels[1]; }
      }
      if (t.percentiles) {
        const [l, r] = sidePairs(t, t.percentiles);
        if (t.raw !== undefined) out.vald_percentile = t.percentiles[0];
        else { if (l !== null) out.vald_percentile_left = l; if (r !== null) out.vald_percentile_right = r; }
      }
      out.score = t.score;
      if (t.partial) out.partial = true;
      if (t.lsi !== undefined) {
        out.lsi = t.lsi;
        out.lsi_gap_pct = gapOf(t.lsi);
      }
      if (!tdef.stat) out.feeds_ovr = false;
      return out;
    });

    const stats = {};
    for (const [k, v] of Object.entries(scored.stats)) stats[k] = { ...v };

    const ovr = scored.ovr.value === null
      ? { value: null, status: 'pending', message: scored.ovr.message, reasons: scored.ovr.reasons.map(reasonText) }
      : { value: scored.ovr.value, provisional: scored.ovr.provisional, reasons: scored.ovr.reasons.map(reasonText) };

    const flags = scored.flags.map(f => ({
      ...f,
      test: TEST_INFO[f.test].label,
      ...(f.type === 'LSI' && f.value !== undefined ? { gap_pct: gapOf(f.value) } : {})
    }));

    // What was not tested, so the text never calls the session "complete".
    const notTested = [
      ...tests.filter(t => t.status !== 'completed').map(t => t.name),
      ...Object.entries(stats).filter(([, v]) => v.value === null).map(([k]) => `${STAT_LABELS[k]} (stat)`)
    ];

    return {
      athlete: scored.athlete,
      sport: scored.sport,
      config_version: scored.config_version,
      session: { everything_tested: notTested.length === 0, not_tested: notTested },
      ovr,
      stats,
      tests,
      flags
    };
  };

  // ---------- Gemini narrative ----------

  /**
   * Asks Gemini for the report text and rejects any answer that contains a
   * number not found in the payload, retrying up to MAX_ATTEMPTS times.
   * Returns { narrative, rawResponse, attempts }.
   */
  const generateNarrative = async (payload, { callModel = aiEngine.callGemini } = {}) => {
    const basePrompt = `Write the report text for this ${sp.key} testing session.\n\nPAYLOAD:\n${JSON.stringify(payload, null, 2)}`;
    let prompt = basePrompt;
    let lastProblem = '';
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const rawResponse = await callModel(SYSTEM_PROMPT, prompt);
      let parsed;
      try {
        parsed = JSON.parse(stripFences(rawResponse));
      } catch (e) {
        lastProblem = 'the answer was not valid JSON';
        prompt = `${basePrompt}\n\nYour previous answer was not valid JSON. Return only the JSON object.`;
        continue;
      }
      const narrative = normaliseNarrative(parsed, payload);
      const bad = findUnsupportedNumbers(narrative, payload);
      const wording = findWordingProblems(narrative, payload);
      if (!bad.length && !wording.length) return { narrative, rawResponse, attempts: attempt };
      const fixes = [];
      if (bad.length) fixes.push(`it used numbers that are not in the payload: ${bad.join(', ')}. Use only numbers that appear in the payload, or describe in words`);
      fixes.push(...wording);
      lastProblem = bad.length ? `it used numbers not in the scores (${bad.join(', ')})` : wording[0];
      console.warn(`[${sp.key}] Gemini attempt ${attempt} rejected: ${fixes.join('; ')}`);
      prompt = `${basePrompt}\n\nYour previous answer was rejected because ${fixes.join('; and ')}. Rewrite it.`;
    }
    const err = new Error(`The AI's report text was rejected ${MAX_ATTEMPTS} times because ${lastProblem}. No report was saved. Please try again.`);
    err.statusCode = 502;
    throw err;
  };

  // ---------- report card ----------

  /**
   * Maps engine output + Gemini text onto the report card shape
   * (ovrScores, manualBattery, dynamoStrength, symmetrySummary, fieldMeaning,
   * testTable), so the report page and PDF export work unchanged. Every
   * number here comes from the engine. Scores are null ("Not tested") when missing.
   */
  const buildReportContent = (profile, scored, narrative, session = {}) => {
    const byName = Object.fromEntries(scored.tests.map(t => [t.name, t]));
    const tags = statTags(scored.stats);
    const monitorTests = new Set(scored.flags.filter(f => f.level === 'monitor').map(f => f.test));

    const ovrScores = ['Speed', 'Agility', 'Power', 'Endurance', 'Reaction', 'Balance'].map(name => {
      const s = scored.stats[name.toLowerCase()];
      return { name, score: s.value, ...(s.value === null ? { status: s.status } : {}), ...(s.partial ? { partial: true } : {}) };
    });

    const manualBattery = MANUAL.map(n => {
      const t = byName[n];
      const info = TEST_INFO[n];
      const done = t.status === 'completed';
      let raw = done ? fmt(t.raw, info.unit) : '—';
      // Timed both ways: the scored (faster) time, then both feet.
      if (done && cfg.tests[n].best_of_left_right) raw += ` (L ${t.raw_left ?? '—'} · R ${t.raw_right ?? '—'})`;
      if (done && t.timing === 'hand') raw += ' (hand)';
      const pending = t.benchmark === 'pending';
      return {
        test: info.label,
        raw,
        avg: done ? (pending ? 'benchmarks pending' : 'vs published international norms') : notTestedText(t.status),
        score: t.score,
        status: t.status
      };
    });

    const dynamoStrength = DYNAMO.map(n => {
      const t = byName[n];
      const done = t.status === 'completed';
      let status = 'NOT TESTED';
      if (done) {
        if (t.one_side_only) status = 'ONE SIDE ONLY';
        else if (monitorTests.has(n)) status = 'MONITOR — DOMINANT ARM';
        else if (t.lsi < cfg.lsi.red_below) status = 'REVIEW — RED';
        else if (t.lsi < cfg.lsi.amber_below) status = 'REVIEW — AMBER';
        else status = 'WITHIN RANGE';
      }
      if (done && t.benchmark === 'not_rated') status = 'MEASURED, NOT RATED';
      const [pl, pr] = t.percentiles ? sidePairs(t, t.percentiles) : [null, null];
      return {
        joint: TEST_INFO[n].label,
        ...(pl !== null || pr !== null ? { percentileLeft: pl, percentileRight: pr } : {}),
        left: done ? fmt(t.raw_left, 'N') : '—',
        right: done ? fmt(t.raw_right, 'N') : '—',
        lsi: t.lsi !== undefined ? t.lsi : null,
        score: t.score,
        status
      };
    });

    const movementScreen = MOVEMENT.map(n => {
      const t = byName[n];
      const info = TEST_INFO[n];
      const done = t.status === 'completed';
      const result = !done ? notTestedText(t.status)
        : t.raw !== undefined ? fmt(t.raw, info.unit)
          : `L ${fmt(t.raw_left, info.unit)} · R ${fmt(t.raw_right, info.unit)}`;
      return {
        test: info.label,
        result,
        band: !done ? '' : t.benchmark === 'not_rated' ? 'Measured, not rated'
          : t.bands ? t.bands.map(b => bandLabel(b) || '').join(' / ') : '',
        score: t.score,
        feedsOvr: !!cfg.tests[n].stat,
        status: t.status
      };
    });

    // One row per test, in battery order, for the player card's results table.
    // Raw values are exactly what the engine stored; units kept separate.
    const testTable = scored.tests.map(t => {
      const info = TEST_INFO[t.name];
      const done = t.status === 'completed';
      let result = '—';
      if (done) {
        if (t.raw_left !== undefined || t.raw_right !== undefined) {
          result = `L ${t.raw_left ?? '—'} · R ${t.raw_right ?? '—'}`;
        } else {
          result = String(t.raw);
        }
      }
      return {
        test: info.label,
        result,
        unit: info.unit === 'composite score' ? 'score' : info.unit,
        timing: t.timing || null,
        score: t.score,
        status: t.status,
        partial: !!t.partial,
        oneSideOnly: !!t.one_side_only,
        feedsOvr: !!cfg.tests[t.name].stat,
        ...(t.benchmark === 'pending' && done ? { benchmarkPending: true } : {}),
        ...(t.benchmark === 'not_rated' && done ? { notRated: true } : {})
      };
    });

    // How the athlete compares, in VALD's own terms: every VALD battery test
    // done this session, per side. The card score (25-99) and VALD's
    // percentile are different numbers and are labelled apart.
    const valdNorms = scored.tests.filter(t => cfg.tests[t.name].source === 'vald' && t.status === 'completed').map(t => {
      const info = TEST_INFO[t.name];
      const device = cfg.tests[t.name].dynamo ? 'Dynamo' : 'HumanTrak';
      const sides = t.raw !== undefined ? [['Result', t.raw, 0]]
        : [['Left', t.raw_left], ['Right', t.raw_right]].filter(([, v]) => v !== null && v !== undefined)
          .map(([side, v], i) => [side, v, i]);
      return {
        test: info.label,
        device,
        cardScore: t.score,
        notRated: t.benchmark === 'not_rated',
        sides: sides.map(([side, v, i]) => {
          const pct = t.percentiles ? t.percentiles[i] : null;
          const band = t.bands ? bandLabel(t.bands[i]) : null;
          return {
            side,
            result: fmt(v, info.unit),
            ...(pct !== null && pct !== undefined ? { percentile: pct, percentileLabel: `${ordinal(pct)} percentile`, percentileText: `${percentileWords(pct, device)[0].toUpperCase()}${percentileWords(pct, device).slice(1)}` } : {}),
            ...(band ? { band } : {})
          };
        })
      };
    });

    const lsiTests = dynamoStrength.filter(d => d.lsi !== null);
    const lowest = lsiTests.sort((a, b) => a.lsi - b.lsi)[0];

    const lowestStat = Object.entries(scored.stats)
      .filter(([, v]) => v.value !== null)
      .sort((a, b) => a[1].value - b[1].value)[0];

    const flagLevelsText = scored.flags.length
      ? `${scored.flags.length} flag${scored.flags.length > 1 ? 's' : ''} to work on`
      : 'No flags this session';

    return {
      athleteName: profile.name,
      age: profile.age,
      sport: sp.displayName,
      position: profile.position,
      ...(profile.dominantHand ? { dominantHand: profile.dominantHand } : {}),
      testDate: profile.testDate,
      batteryLabel: sp.batteryLabel,
      overallOVR: scored.ovr.value,
      ovrProvisional: !!scored.ovr.provisional,
      ovrStatus: scored.ovr.value === null ? 'pending' : (scored.ovr.provisional ? 'provisional' : 'final'),
      ovrMessage: scored.ovr.message || '',
      ovrReasons: scored.ovr.reasons.map(reasonText),
      ovrScores,
      manualBattery,
      dynamoStrength,
      movementScreen,
      testTable,
      valdNorms,
      flags: scored.flags.map((f, i) => ({
        level: f.level,
        test: TEST_INFO[f.test].label,
        type: f.type,
        ...(f.value !== undefined ? { value: f.value } : {}),
        ...(f.dominant_side_weaker ? { dominantSideWeaker: true } : {}),
        note: narrative.flags[i] || ''
      })),
      symmetrySummary: {
        lowest: lowest ? `${lowest.lsi}% — ${lowest.joint}` : 'Not available — both sides needed',
        flag: narrative.symmetry || flagLevelsText,
        recommendation: narrative.recommendation
      },
      summary: narrative.summary,
      fieldMeaning: {
        playerProfile: narrative.playerProfile,
        developmentPriority: lowestStat ? STAT_LABELS[lowestStat[0]] : '',
        stats: ['speed', 'agility', 'endurance', 'power', 'balance', 'reaction'].map(k => ({
          name: STAT_LABELS[k],
          score: scored.stats[k].value,
          tag: tags[k] || (scored.stats[k].status === 'benchmark_pending' ? 'PENDING' : 'NOT TESTED'),
          body: narrative.stats[k]
        }))
      },
      // Shown only; not scored and not part of the Gemini payload or the OVR.
      additionalVald: profile.additionalVald || [],
      // Results read from a VALD Hub PDF (the report words its extra results for that).
      ...(Object.values(session.tests || {}).some(t => t.source === 'vald_pdf') || (profile.additionalVald || []).some(r => r.source === 'vald_pdf')
        ? { valdFromPdf: true } : {}),
      benchmarkNote: 'Manual tests compared with published international norms; HumanTrak and Dynamo tests compared with others of the same age and sex.',
      configVersion: scored.config_version
    };
  };

  /**
   * Full pipeline for one session. Returns everything the controller saves.
   */
  const runPipeline = async (profile, session, opts) => {
    const scored = scoreSession(session, cfg);
    // Custom sessions: an OVR needs 3+ scored stats; otherwise "No OVR".
    if (sp.noOvrMessage && scored.ovr.value === null) scored.ovr.message = sp.noOvrMessage;
    const payload = buildGeminiPayload(scored, session);
    const { narrative, rawResponse } = await generateNarrative(payload, opts);
    const reportContent = buildReportContent(profile, scored, narrative, session);
    return { scored, payload, narrative, rawResponse, reportContent };
  };

  return {
    sport: sp,
    cfg,
    TEST_INFO,
    SYSTEM_PROMPT,
    validateInput,
    buildGeminiPayload,
    generateNarrative,
    buildReportContent,
    runPipeline
  };
};

const SCORED_SPORTS = Object.keys(SPORT_PROFILES);

module.exports = { forSport, forCustom, findUnsupportedNumbers, findWordingProblems, cleanAdditionalVald, SCORED_SPORTS, SPORT_PROFILES, CUSTOM_PROFILE, ALL_TEST_INFO };

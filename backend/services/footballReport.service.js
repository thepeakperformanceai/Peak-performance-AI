// services/footballReport.service.js
// Football reports from manually entered test results (Football OVR Scoring
// Spec v1).
//
//   tester's input -> validateFootballInput -> scoring engine (every number)
//                  -> buildGeminiPayload -> Gemini (words only)
//                  -> number check -> buildReportContent (card shape)
//
// Gemini never calculates a number: it receives the finished scores and its
// answer is rejected if it contains any number that is not in the payload.

const { scoreSession, loadConfig, STATUSES } = require('../scoring/scoring');
const aiEngine = require('./aiEngine.service');

const cfg = loadConfig();

const TEST_INFO = {
  sprint_10m:       { label: '10m Sprint',              unit: 's' },
  sprint_30m:       { label: '30m Sprint',              unit: 's' },
  ruler_drop:       { label: 'Ruler Drop',              unit: 'cm' },
  beep_test:        { label: 'Beep Test',               unit: 'level.shuttle' },
  single_leg_stand: { label: 'Single Leg Stand (Eyes Closed)', unit: 's' },
  trunk_rotation:   { label: 'Trunk Rotation',          unit: '°' },
  overhead_squat:   { label: 'Overhead Squat',          unit: 'composite score' },
  hip_extension:    { label: 'Hip Extension',           unit: 'N' },
  knee_extension:   { label: 'Knee Extension',          unit: 'N' }
};

const STAT_LABELS = {
  speed: 'Speed', power: 'Power', agility: 'Agility',
  endurance: 'Endurance', balance: 'Balance', reaction: 'Reaction'
};

const STATUS_LABELS = {
  completed: 'completed', not_done: 'not done', injured: 'injured',
  equipment_fault: 'equipment fault', invalid: 'invalid (value outside the plausible range)'
};

const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'];
const SEXES = ['M', 'F'];
const TIMING = ['hand', 'electronic'];
const BODYWEIGHT_RANGE = [30, 160];

const badRequest = (msg) => {
  const err = new Error(msg);
  err.statusCode = 400;
  return err;
};

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

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

  if (name === 'beep_test') {
    const level = toNum(raw.level, `${label} level`);
    const shuttle = toNum(raw.shuttle, `${label} shuttle`);
    if (level === undefined || shuttle === undefined) throw badRequest(`${label}: enter level and shuttle, or change the status`);
    if (!Number.isInteger(level) || !cfg.beep_shuttles_per_level[String(level)]) {
      throw badRequest(`${label}: level must be a whole number from 1 to 21`);
    }
    const maxShuttle = cfg.beep_shuttles_per_level[String(level)];
    if (!Number.isInteger(shuttle) || shuttle < 0 || shuttle > maxShuttle) {
      throw badRequest(`${label}: shuttle must be a whole number from 0 to ${maxShuttle} at level ${level}`);
    }
    return { status, level, shuttle };
  }

  if (tdef.source === 'manual') {
    const value = toNum(raw.value, label);
    if (value === undefined) throw badRequest(`${label}: enter a value, or change the status`);
    return { status, value };
  }

  // VALD tests, entered by hand from the VALD report.
  const out = { status };
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

  const cutoffs = Array.isArray(raw.cutoffs) ? raw.cutoffs.filter(c => c !== '' && c !== null && c !== undefined) : [];
  if (cutoffs.length) {
    const nums = cutoffs.map((c, i) => toNum(c, `${label} cut-off ${i + 1}`));
    if (nums.length !== 4 || nums.some((c, i) => i > 0 && c < nums[i - 1])) {
      throw badRequest(`${label}: enter all 4 VALD cut-offs, lowest first`);
    }
    out.cutoffs = nums;
  } else {
    const bandKeys = tdef.bilateral ? ['band_left', 'band_right'] : ['band'];
    for (const key of bandKeys) {
      if (raw[key]) {
        if (!cfg.vald_band_labels.includes(raw[key])) throw badRequest(`${label}: unknown VALD band "${raw[key]}"`);
        out[key] = raw[key];
      }
    }
    const needed = tdef.bilateral
      ? [['left', 'band_left'], ['right', 'band_right']].filter(([side]) => out[side] !== undefined).map(([, k]) => k)
      : ['band'];
    if (needed.some(k => !out[k])) {
      throw badRequest(`${label}: enter the 4 VALD cut-offs, or the VALD band for each side entered`);
    }
  }
  return out;
};

/**
 * Validates the tester's entry and returns { profile, session }.
 * body = { profile: {...}, football: { timingMethod, tests: {...} } }
 */
const validateFootballInput = (profileIn = {}, footballIn = {}) => {
  const name = String(profileIn.name || '').trim();
  if (!name) throw badRequest('Athlete name is required');
  const dob = parseDate(profileIn.dob, 'Date of birth');
  const testDateStr = profileIn.testDate || new Date().toISOString().slice(0, 10);
  const testDate = parseDate(testDateStr, 'Test date');
  const age = ageOn(dob, testDate);
  if (age < 5 || age > 80) throw badRequest('Date of birth gives an age outside 5–80 — please check it');
  if (!SEXES.includes(profileIn.sex)) throw badRequest('Sex is required (M or F)');
  if (!POSITIONS.includes(profileIn.position)) throw badRequest('Position is required (GK, DEF, MID or FWD)');
  const bodyweight = toNum(profileIn.bodyweight, 'Bodyweight');
  if (bodyweight === undefined) throw badRequest('Bodyweight is required');
  if (bodyweight < BODYWEIGHT_RANGE[0] || bodyweight > BODYWEIGHT_RANGE[1]) {
    throw badRequest(`Bodyweight must be ${BODYWEIGHT_RANGE[0]}–${BODYWEIGHT_RANGE[1]} kg — please re-check it`);
  }
  const timing = footballIn.timingMethod;
  if (!TIMING.includes(timing)) throw badRequest('Timing method is required (hand or electronic)');

  const testsIn = footballIn.tests || {};
  const tests = {};
  for (const testName of Object.keys(cfg.tests)) tests[testName] = cleanTest(testName, testsIn[testName]);
  if (!Object.values(tests).some(t => t.status === 'completed')) {
    throw badRequest('Enter at least one completed test');
  }

  const profile = {
    name,
    dob: profileIn.dob,
    age,
    sex: profileIn.sex,
    position: profileIn.position,
    bodyweight: Math.round(bodyweight * 10) / 10,
    testDate: testDateStr,
    trainingLevel: profileIn.trainingLevel,
    knownInjuries: profileIn.knownInjuries || '',
    practitioner: profileIn.practitioner || 'Not specified',
    customParams: profileIn.customParams || {}
  };
  const session = {
    athlete: { id: profileIn.athleteId || null, age, sex: profile.sex, position: profile.position },
    timing_method: timing,
    tests
  };
  return { profile, session };
};

// ---------- Gemini payload ----------

const bandLabel = (i) => (i === null || i === undefined ? null : cfg.vald_band_labels[i]);

const reasonText = (reason) => {
  const m = /^(\w+): (\w+)$/.exec(reason);
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
    } else {
      out.raw = t.raw;
    }
    if (t.name === 'beep_test') {
      out.level = session.tests.beep_test.level;
      out.shuttle = session.tests.beep_test.shuttle;
    }
    out.unit = info.unit;
    if (t.timing) out.timing = t.timing;
    out.benchmark = t.benchmark;
    if (t.bands) {
      const labels = t.bands.map(bandLabel);
      if (labels.length === 1) out.vald_band = labels[0];
      else { out.vald_band_left = labels[0]; out.vald_band_right = labels[1]; }
    }
    out.score = t.score;
    if (t.partial) out.partial = true;
    if (t.lsi !== undefined) out.lsi = t.lsi;
    if (!tdef.stat) out.feeds_ovr = false;
    return out;
  });

  const stats = {};
  for (const [k, v] of Object.entries(scored.stats)) stats[k] = { ...v };

  const ovr = scored.ovr.value === null
    ? { value: null, status: 'pending', message: scored.ovr.message, reasons: scored.ovr.reasons.map(reasonText) }
    : { value: scored.ovr.value, provisional: scored.ovr.provisional, reasons: scored.ovr.reasons.map(reasonText) };

  const flags = scored.flags.map(f => ({ ...f, test: TEST_INFO[f.test].label }));

  return {
    athlete: scored.athlete,
    sport: scored.sport,
    config_version: scored.config_version,
    ovr,
    stats,
    tests,
    flags
  };
};

// ---------- Gemini narrative ----------

const SYSTEM_PROMPT = `You are a sports scientist at PeakPerformance.pk writing the text of a football athlete's test report.

You receive a JSON payload of FINISHED scores. The scores were calculated in code; your job is words only.

RULES (all mandatory):
1. Use only numbers present in the payload. Never compute, adjust, estimate, average or invent any number. If you mention a number, copy it exactly as it appears in the payload. When in doubt, describe in words instead of numbers.
2. A stat whose value is null is "not tested this session". Do not speculate on why and never estimate it. Agility is not in the current test battery: say it was not tested this session.
3. If ovr.provisional is true, say once, plainly, that the rating will firm up after the remaining tests. If the OVR value is null, say the overall rating is pending until testing is complete.
4. Describe flags as areas to work on, never as diagnoses, injuries or injury predictions.
5. Benchmark wording: tests with benchmark "research" are "compared with published international norms". Tests with benchmark "vald_age_sex" (HumanTrak and Dynamo) are "compared with others of the same age and sex". Never say a VALD result is compared with footballers.
6. Write for a football coach and the athlete: plain English, specific to football, encouraging but honest. Refer to the athlete as "the athlete" (no name is given).

Return ONLY one JSON object, no markdown, in exactly this shape:
{
  "playerProfile": "one line on how this profile shows up on the pitch",
  "summary": "2-3 sentences summarising the session",
  "stats": {
    "speed": "1-2 sentences", "power": "1-2 sentences", "agility": "1-2 sentences",
    "endurance": "1-2 sentences", "balance": "1-2 sentences", "reaction": "1-2 sentences"
  },
  "symmetry": "1-2 sentences on left/right strength balance (Hip and Knee Extension)",
  "recommendation": "1-2 sentences on what to work on next",
  "flags": ["one short sentence per flag in the payload, same order (the test name is already shown beside it)"]
}`;

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

/**
 * Asks Gemini for the report text and rejects any answer that contains a
 * number not found in the payload, retrying up to MAX_ATTEMPTS times.
 * Returns { narrative, rawResponse, attempts }.
 */
const generateNarrative = async (payload, { callModel = aiEngine.callGemini } = {}) => {
  const basePrompt = `Write the report text for this football testing session.\n\nPAYLOAD:\n${JSON.stringify(payload, null, 2)}`;
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
    if (!bad.length) return { narrative, rawResponse, attempts: attempt };
    lastProblem = `it used numbers not in the scores (${bad.join(', ')})`;
    console.warn(`[football] Gemini attempt ${attempt} rejected: ${lastProblem}`);
    prompt = `${basePrompt}\n\nYour previous answer used numbers that are not in the payload: ${bad.join(', ')}. ` +
      'Rewrite it using only numbers that appear in the payload, or describe in words.';
  }
  const err = new Error(`The AI's report text was rejected ${MAX_ATTEMPTS} times because ${lastProblem}. No report was saved. Please try again.`);
  err.statusCode = 502;
  throw err;
};

// ---------- report card ----------

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
 * Maps engine output + Gemini text onto the existing report card shape
 * (ovrScores, manualBattery, dynamoStrength, symmetrySummary, fieldMeaning),
 * so the report page and PDF export work unchanged. Every number here comes
 * from the engine. Scores are null (shown as "Not tested") when missing.
 */
const buildReportContent = (profile, scored, narrative) => {
  const byName = Object.fromEntries(scored.tests.map(t => [t.name, t]));
  const tags = statTags(scored.stats);

  const ovrScores = ['Speed', 'Agility', 'Power', 'Endurance', 'Reaction', 'Balance'].map(name => {
    const s = scored.stats[name.toLowerCase()];
    return { name, score: s.value, ...(s.value === null ? { status: s.status } : {}), ...(s.partial ? { partial: true } : {}) };
  });

  const manualBattery = ['sprint_10m', 'sprint_30m', 'ruler_drop', 'beep_test'].map(n => {
    const t = byName[n];
    const info = TEST_INFO[n];
    const done = t.status === 'completed';
    let raw = done ? (n === 'beep_test' ? `Level ${t.raw}` : fmt(t.raw, info.unit)) : '—';
    if (done && t.timing === 'hand') raw += ' (hand)';
    return {
      test: info.label,
      raw,
      avg: done ? 'vs published international norms' : notTestedText(t.status),
      score: t.score,
      status: t.status
    };
  });

  const dynamoStrength = ['hip_extension', 'knee_extension'].map(n => {
    const t = byName[n];
    const done = t.status === 'completed';
    let status = 'NOT TESTED';
    if (done) {
      if (t.one_side_only) status = 'ONE SIDE ONLY';
      else if (t.lsi < cfg.lsi.red_below) status = 'REVIEW — RED';
      else if (t.lsi < cfg.lsi.amber_below) status = 'REVIEW — AMBER';
      else status = 'WITHIN RANGE';
    }
    return {
      joint: TEST_INFO[n].label,
      left: done ? fmt(t.raw_left, 'N') : '—',
      right: done ? fmt(t.raw_right, 'N') : '—',
      lsi: t.lsi !== undefined ? t.lsi : null,
      score: t.score,
      status
    };
  });

  const movementScreen = ['single_leg_stand', 'trunk_rotation', 'overhead_squat'].map(n => {
    const t = byName[n];
    const info = TEST_INFO[n];
    const done = t.status === 'completed';
    const result = !done ? notTestedText(t.status)
      : t.raw !== undefined ? fmt(t.raw, info.unit)
        : `L ${fmt(t.raw_left, info.unit)} · R ${fmt(t.raw_right, info.unit)}`;
    return {
      test: info.label,
      result,
      band: done && t.bands ? t.bands.map(b => (b === null ? '' : cfg.vald_band_labels[b].replace(/_/g, ' '))).join(' / ') : '',
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
      feedsOvr: !!cfg.tests[t.name].stat
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
    sport: 'Football',
    position: profile.position,
    testDate: profile.testDate,
    batteryLabel: 'Football Battery v1',
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
    flags: scored.flags.map((f, i) => ({
      level: f.level,
      test: TEST_INFO[f.test].label,
      type: f.type,
      ...(f.value !== undefined ? { value: f.value } : {}),
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
        tag: tags[k] || 'NOT TESTED',
        body: narrative.stats[k]
      }))
    },
    benchmarkNote: 'Manual tests compared with published international norms; HumanTrak and Dynamo tests compared with others of the same age and sex.',
    configVersion: scored.config_version
  };
};

/**
 * Full pipeline for one session. Returns everything the controller saves.
 */
const runFootballPipeline = async (profile, session, opts) => {
  const scored = scoreSession(session, cfg);
  const payload = buildGeminiPayload(scored, session);
  const { narrative, rawResponse } = await generateNarrative(payload, opts);
  const reportContent = buildReportContent(profile, scored, narrative);
  return { scored, payload, narrative, rawResponse, reportContent };
};

module.exports = {
  TEST_INFO,
  SYSTEM_PROMPT,
  validateFootballInput,
  buildGeminiPayload,
  findUnsupportedNumbers,
  generateNarrative,
  buildReportContent,
  runFootballPipeline
};

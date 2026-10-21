// services/clientReport.service.js
// Client card reports (VALD machine tests only) for football, padel, cricket
// and General / Gym:
//
//   VALD PDF tests (checked by the tester) -> validateClientInput
//     -> machine card stats and every sentence, chosen in code
//        (machineCard.service.js)
//     -> Gemini rewords those sentences only. Its answer is rejected if it
//        adds a number, an exercise or training prescription, or a device
//        name; after three rejections the code's own sentences are used.
//
// Gemini never picks what the report says, never scores and never adds
// advice. Nothing missing is estimated.

const aiEngine = require('./aiEngine.service');
const { findUnsupportedNumbers } = require('./scoredReport.service');
const { buildMachineReport, SPORTS } = require('./machineCard.service');
const { loadMachineConfig } = require('../scoring/machineCard');

const badRequest = (msg) => {
  const err = new Error(msg);
  err.statusCode = 400;
  return err;
};

const isSet = (v) => v !== undefined && v !== null && v !== '';
const BODYWEIGHT_RANGE = [30, 160];
const MAX_TESTS = 60;

const parseDate = (v, field) => {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) throw badRequest(`${field} must be a date (YYYY-MM-DD)`);
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw badRequest(`${field} is not a valid date`);
  return d;
};
const ageOn = (dob, on) => {
  let age = on.getUTCFullYear() - dob.getUTCFullYear();
  const m = on.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < dob.getUTCDate())) age--;
  return age;
};
const num = (v, field) => {
  if (!isSet(v)) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw badRequest(`${field} must be a number`);
  return n;
};

/**
 * profileIn: { name, dob, testDate, sex, bodyweight?, position?, dominantHand? }
 * resultsIn: { sport, tests: [{ key, label, device, unit, sides: { left|right|value: { value, percentile, band } } }] }
 * Returns { sport, profile, tests }.
 */
const validateClientInput = (profileIn = {}, resultsIn = {}) => {
  const sport = String(resultsIn.sport || '');
  if (!SPORTS.includes(sport)) throw badRequest('Sport must be football, padel, cricket or general');
  const name = String(profileIn.name || '').trim().slice(0, 80);
  if (!name) throw badRequest('Athlete name is required');
  const dob = parseDate(profileIn.dob, 'Date of birth');
  const testDate = profileIn.testDate || new Date().toISOString().slice(0, 10);
  const age = ageOn(dob, parseDate(testDate, 'Test date'));
  if (age < 5 || age > 80) throw badRequest('Date of birth gives an age outside 5–80 — please check it');
  if (!['M', 'F'].includes(profileIn.sex)) throw badRequest('Sex is required (M or F)');
  const bodyweight = num(profileIn.bodyweight, 'Bodyweight');
  if (bodyweight !== null && (bodyweight < BODYWEIGHT_RANGE[0] || bodyweight > BODYWEIGHT_RANGE[1])) {
    throw badRequest(`Bodyweight must be ${BODYWEIGHT_RANGE[0]}–${BODYWEIGHT_RANGE[1]} kg — please re-check it`);
  }
  const dominantHand = ['L', 'R'].includes(profileIn.dominantHand) ? profileIn.dominantHand : null;

  const mcfg = loadMachineConfig();
  const testsIn = Array.isArray(resultsIn.tests) ? resultsIn.tests.slice(0, MAX_TESTS) : [];
  const tests = [];
  for (const t of testsIn) {
    const label = String(t?.label || '').trim().slice(0, 120);
    if (!label) continue;
    const sides = {};
    for (const side of ['left', 'right', 'value']) {
      const s = t.sides?.[side];
      if (!s) continue;
      const value = num(s.value, `${label} ${side}`);
      if (value === null) continue;
      const percentile = num(s.percentile, `${label} ${side} percentile`);
      if (percentile !== null && (percentile < 0 || percentile > 100)) throw badRequest(`${label}: VALD percentile must be 0–100`);
      const band = s.band && mcfg.vald_band_labels.includes(s.band) ? s.band : null;
      if (s.band && !band && s.band !== 'not_rated') throw badRequest(`${label}: unknown VALD band "${s.band}"`);
      sides[side] = { value, percentile, band };
    }
    if (!Object.keys(sides).length) continue;
    tests.push({
      key: typeof t.key === 'string' && /^[a-z_]{1,40}$/.test(t.key) ? t.key : null,
      label, device: t.device === 'Dynamo' ? 'Dynamo' : 'HumanTrak',
      unit: String(t.unit || '').slice(0, 12), sides
    });
  }
  if (!tests.length) throw badRequest('No VALD results: upload the VALD report PDF');

  const profile = {
    name, dob: profileIn.dob, age, sex: profileIn.sex, testDate,
    ...(bodyweight !== null ? { bodyweight: Math.round(bodyweight * 10) / 10 } : {}),
    position: String(profileIn.position || '').trim().slice(0, 12).toUpperCase(),
    ...(dominantHand ? { dominantHand } : {}),
    trainingLevel: profileIn.trainingLevel || '',
    knownInjuries: String(profileIn.knownInjuries || '').slice(0, 500),
    practitioner: profileIn.practitioner || 'Not specified'
  };
  return { sport, profile, tests };
};

// ---------- Gemini: rewording only ----------

const MAX_ATTEMPTS = 3;
const STAT_KEYS = ['strength', 'symmetry', 'balance', 'movement', 'mobility'];

const SYSTEM_PROMPT = `You are a sports scientist at PeakPerformance.pk rewording the text of a client's fitness card.

Every sentence in the payload is already complete and correct. It was chosen and written in code from the client's VALD results. Your job is only to make it read more warmly and naturally, like a coach talking to this client.

RULES (all mandatory):
1. Use only numbers present in the payload, copied exactly. Never compute, round, estimate or invent a number.
2. Never add, name or suggest an exercise, drill, stretch, set, rep, hold or training load. Never add advice that isn't in the text.
3. Keep every fact. Don't drop anything, don't add claims, and don't change which stat is the strongest or the development priority.
4. A stat marked "Not tested" stays not tested: never rate or describe it.
5. If a sentence says a score is proposed and pending clinical review, keep that meaning.
6. Never mention testing devices or brands (no "HumanTrak" or "Dynamo") and never use newtons.
7. No diagnoses, injuries or injury predictions; describe weaknesses as things to build.
8. Speak to the client as "you". Plain English. No markdown. Keep each text about as long as the original.

Return ONLY one JSON object, no markdown, in exactly this shape:
{
  "summary": "reworded summary",
  "stats": { "strength": "...", "symmetry": "...", "balance": "...", "movement": "...", "mobility": "..." },
  "focus": "reworded focus",
  "flags": ["reworded flag text, same order"]
}`;

const buildPolishPayload = (coachText, profile) => ({
  first_name: profile.name.split(/\s+/)[0],
  summary: coachText.summary,
  stats: coachText.stats,
  focus: coachText.focus,
  flags: coachText.flags
});

// A prescription, or an exercise word the code's text didn't use, is not Gemini's to write.
const PRESCRIPTION = /\b(?:sets?|reps?|repetitions?|holds?|rounds?)\s+of\b|\b\d+\s*(?:x|×)\s*\d+|\b\d+\s+(?:sets|reps|repetitions|holds|rounds|seconds|minutes)\b/i;
// Unambiguous exercise and training words (not everyday verbs like "raise" or
// "press", and not "band", which means a VALD band here).
const EXERCISE_WORDS = ['exercise', 'exercises', 'workout', 'workouts', 'drill', 'drills', 'stretch', 'stretches', 'stretching', 'lunge', 'lunges',
  'deadlift', 'deadlifts', 'plank', 'planks', 'curls', 'nordic', 'nordics', 'copenhagen', 'clamshell', 'clamshells', 'step-up', 'step-ups',
  'hops', 'foam', 'yoga', 'pilates', 'weights', 'dumbbell', 'dumbbells', 'kettlebell', 'kettlebells', 'barbell', 'barbells'];
const DEVICE_WORDS = /\b(?:humantrak|dynamo|newtons?)\b|\d\s*N\b/i;
const words = (s) => new Set(String(s).toLowerCase().split(/[^a-z-]+/).filter(Boolean));

const stripFences = (text) => {
  let t = String(text || '').replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first !== -1 && last > first) t = t.slice(first, last + 1);
  return t;
};

const problemsWith = (prose, payload) => {
  const out = [];
  if (typeof prose.summary !== 'string' || !prose.summary.trim()) out.push('summary is missing');
  if (typeof prose.focus !== 'string') out.push('focus is missing');
  if (!prose.stats || STAT_KEYS.some(k => typeof prose.stats[k] !== 'string' || !prose.stats[k].trim())) out.push(`stats must have text for ${STAT_KEYS.join(', ')}`);
  if (!Array.isArray(prose.flags) || prose.flags.length !== payload.flags.length) out.push(`flags must have ${payload.flags.length} strings`);
  if (out.length) return out;
  const strings = [prose.summary, prose.focus, ...STAT_KEYS.map(k => prose.stats[k]), ...prose.flags];
  const bad = findUnsupportedNumbers({ strings }, payload);
  if (bad.length) out.push(`it used numbers that are not in the payload: ${bad.join(', ')}`);
  if (strings.some(s => PRESCRIPTION.test(s))) out.push('it wrote a training prescription (sets, reps, holds, rounds or times); that is not yours to write');
  const source = words(JSON.stringify(payload));
  const added = [...new Set(strings.flatMap(s => [...words(s)]).filter(w => EXERCISE_WORDS.includes(w) && !source.has(w)))];
  if (added.length) out.push(`it named exercises or training that the text doesn't (${added.join(', ')}); never add exercises`);
  if (strings.some(s => DEVICE_WORDS.test(s))) out.push('it named a testing device or a device unit (HumanTrak, Dynamo, newtons)');
  // A stat the code says wasn't tested must still say so.
  for (const k of STAT_KEYS) {
    if (/^Not tested/.test(payload.stats[k]) && !/not tested/i.test(prose.stats[k])) out.push(`${k} was not tested and must still say "not tested"`);
  }
  return out;
};

/**
 * Gemini's rewording of the code's sentences when it passes every check,
 * otherwise the code's own sentences. Never throws for a bad or missing AI
 * answer. Returns { prose, source, attempts, reason }.
 */
const polishClientText = async (coachText, profile, { callModel = aiEngine.callGemini } = {}) => {
  const payload = buildPolishPayload(coachText, profile);
  const base = `Reword this client's card text.\n\nPAYLOAD:\n${JSON.stringify(payload, null, 2)}`;
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
      summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
      stats: Object.fromEntries(STAT_KEYS.map(k => [k, typeof parsed.stats?.[k] === 'string' ? parsed.stats[k].trim() : ''])),
      focus: typeof parsed.focus === 'string' ? parsed.focus.trim() : '',
      flags: Array.isArray(parsed.flags) ? parsed.flags.map(s => String(s ?? '').trim()) : null
    };
    const problems = problemsWith(prose, payload);
    if (!problems.length) return { prose, source: 'gemini', attempts: attempt, raw };
    lastProblem = problems.join('; ');
    console.warn(`[client card] Gemini attempt ${attempt} rejected: ${lastProblem}`);
    prompt = `${base}\n\nYour previous answer was rejected because ${problems.join('; and ')}. Rewrite it.`;
  }
  return { prose: null, source: 'coach', reason: lastProblem };
};

/** Full pipeline for one client session. Returns { card, reportContent, polish }. */
const runClientPipeline = async ({ sport, profile, tests }, opts = {}) => {
  const first = buildMachineReport({ tests, sport, profile });
  const polish = await polishClientText(first.coachText, profile, opts);
  if (!polish.prose) return { ...first, polish };
  const { card, reportContent } = buildMachineReport({ tests, sport, profile, prose: polish.prose });
  return { card, reportContent, coachText: first.coachText, polish };
};

module.exports = { validateClientInput, polishClientText, runClientPipeline, SYSTEM_PROMPT, problemsWith };

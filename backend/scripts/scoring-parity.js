// Proves the JavaScript scoring engine matches the Python engine exactly.
//
// Generates random football sessions (every status, hand/electronic timing,
// out-of-range values, missing sides, band-only VALD results, female/youth
// athletes), scores each with both engines and compares the full payloads,
// key order included.
//
// Needs python3 locally. Run from backend/:  npm run parity [-- <count>]

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { scoreSession, loadConfig } = require('../scoring/scoring');

const PY_DIR = path.join(__dirname, '..', '..', 'peakperformance_scoring');
const COUNT = Number(process.argv[2]) || 5000;
const cfg = loadConfig();

// Small seeded PRNG so a failing run can be reproduced.
let seed = 20261011;
const rand = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (lo, hi, dp) => Number((lo + rand() * (hi - lo)).toFixed(dp));

const STATUSES = ['completed', 'completed', 'completed', 'completed', 'not_done', 'injured', 'equipment_fault', 'invalid'];
const BANDS = cfg.vald_band_labels;

const randomCutoffs = (lo, hi) => {
  const c = [between(lo, hi, 1), between(lo, hi, 1), between(lo, hi, 1), between(lo, hi, 1)].sort((a, b) => a - b);
  // keep bands non-zero width
  for (let i = 1; i < 4; i++) if (c[i] <= c[i - 1]) c[i] = Number((c[i - 1] + 1).toFixed(1));
  return c;
};

const manual = (lo, hi, dp) => {
  const status = pick(STATUSES);
  if (status !== 'completed') return { status };
  return { status, value: between(lo, hi, dp) };
};

const valdBilateral = (lo, hi, dp) => {
  const status = pick(STATUSES);
  if (status !== 'completed') return { status };
  const t = { status };
  const sides = pick(['both', 'both', 'both', 'left', 'right', 'none']);
  if (sides === 'both' || sides === 'left') t.left = between(lo, hi, dp);
  if (sides === 'both' || sides === 'right') t.right = between(lo, hi, dp);
  const mode = pick(['cutoffs', 'cutoffs', 'band', 'side_bands', 'percentiles', 'percentiles', 'left_percentile', 'nothing']);
  if (mode === 'cutoffs') t.cutoffs = randomCutoffs(lo, hi);
  if (mode === 'band') t.band = pick(BANDS);
  if (mode === 'side_bands') { t.band_left = pick(BANDS); t.band_right = pick(BANDS); }
  if (mode === 'percentiles') { t.percentile_left = Math.floor(rand() * 101); t.percentile_right = Math.floor(rand() * 101); }
  if (mode === 'left_percentile') t.percentile_left = between(0, 100, 1);
  if (rand() < 0.1) t.higher_is_better = false;
  return t;
};

const randomSession = () => {
  // 5-0-5: a time off each foot (sometimes one foot only, or none).
  const codStatus = pick(STATUSES);
  const cod = { status: codStatus };
  if (codStatus === 'completed') {
    const feet = pick(['both', 'both', 'both', 'left', 'right', 'none']);
    if (feet === 'both' || feet === 'left') cod.left = between(1.6, 4.3, 2);
    if (feet === 'both' || feet === 'right') cod.right = between(1.6, 4.3, 2);
  }
  const ohsStatus = pick(STATUSES);
  const ohs = { status: ohsStatus };
  if (ohsStatus === 'completed') {
    ohs.value = between(10, 100, 0);
    const r = rand();
    if (r < 0.4) ohs.cutoffs = randomCutoffs(20, 90);
    else if (r < 0.7) ohs.band = pick(BANDS);
    else if (r < 0.9) ohs.percentile = between(0, 100, 0);
    // else: measured, not rated
  }
  const tests = {
    sprint_10m: manual(1.2, 3.8, 2),
    sprint_30m: manual(3.3, 8.5, 2),
    ruler_drop: manual(0, 32, 1),
    cod_505: cod,
    single_leg_stand: valdBilateral(0, 32, 0),
    trunk_rotation: valdBilateral(0, 95, 0),
    overhead_squat: ohs,
    hip_extension: valdBilateral(30, 3200, 0),
    knee_extension: valdBilateral(30, 3200, 0)
  };
  // sometimes leave a test out entirely
  for (const k of Object.keys(tests)) if (rand() < 0.05) delete tests[k];
  return {
    athlete: { id: 'P-' + Math.floor(rand() * 10000), age: 12 + Math.floor(rand() * 25), sex: pick(['M', 'M', 'F']), position: pick(['GK', 'DEF', 'MID', 'FWD']) },
    timing_method: pick(['hand', 'electronic']),
    tests
  };
};

const sessions = Array.from({ length: COUNT }, randomSession);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-parity-'));
const inFile = path.join(tmp, 'sessions.json');
fs.writeFileSync(inFile, JSON.stringify(sessions));

// Score every session with the Python engine in one process.
const pyCode = [
  'import sys, json',
  'sys.path.insert(0, sys.argv[1])',
  'import scoring',
  'cfg = scoring.load_config()',
  'out = []',
  'for s in json.load(open(sys.argv[2])):',
  '    try: out.append(scoring.score_session(s, cfg))',
  '    except Exception as e: out.append({"error": str(e)})',
  'print(json.dumps(out))'
].join('\n');
const pyOut = JSON.parse(execFileSync('python3', ['-I', '-B', '-c', pyCode, PY_DIR, inFile], { maxBuffer: 1 << 30 }).toString());
fs.rmSync(tmp, { recursive: true, force: true });

let mismatches = 0;
let errors = 0;
sessions.forEach((s, i) => {
  let js;
  try { js = scoreSession(s, cfg); } catch (e) { js = { error: e.message }; }
  if (pyOut[i].error || js.error) {
    errors++;
    if (!(pyOut[i].error && js.error)) {
      mismatches++;
      if (mismatches <= 3) console.log('Only one engine errored on session', i, JSON.stringify(s), pyOut[i], js);
    }
    return;
  }
  if (JSON.stringify(js) !== JSON.stringify(pyOut[i])) {
    // JSON.stringify differs on 70.0 vs 70 only if values differ, since both
    // sides were parsed/produced as JS numbers — so any difference is real.
    mismatches++;
    if (mismatches <= 3) {
      console.log('MISMATCH on session', i);
      console.log(' input :', JSON.stringify(s));
      console.log(' python:', JSON.stringify(pyOut[i]));
      console.log(' js    :', JSON.stringify(js));
    }
  }
});

console.log(`${COUNT} random sessions: ${COUNT - mismatches} identical, ${mismatches} different (${errors} rejected by both engines as bad input).`);
process.exit(mismatches ? 1 : 0);

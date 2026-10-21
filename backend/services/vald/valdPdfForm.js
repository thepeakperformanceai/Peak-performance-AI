// services/vald/valdPdfForm.js
// VALD Hub PDFs -> the test form, for the tester to check before saving.
//
// Each uploaded PDF is read (valdHubPdf.js); its tests fill the sport's
// battery with VALD's own percentile or band (never cut-offs), and every
// other test becomes an additional result (shown, not scored). The answer
// also lists, row by row, what was read and where it goes, and every test it
// could not read or match, so nothing is filled silently.

const { parsePages, readPages, pdfToResults, toIsoDate } = require('./valdHubPdf');
const { loadConfig } = require('../../scoring/scoring');
const { valdBattery, valdStat, customKeyFor } = require('../customAssessment.service');
const { ALL_TEST_INFO } = require('../scoredReport.service');

const SPORTS = ['football', 'padel', 'cricket', 'custom'];
const SPORT_NAMES = { football: 'football', padel: 'padel', cricket: 'cricket' };

const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Every VALD battery test: { key: { label, unit, bilateral } }.
const masterList = () => Object.fromEntries(Object.entries(valdBattery()).map(([k, t]) => [k, { ...ALL_TEST_INFO[k], bilateral: !!t.bilateral }]));

const badRequest = (msg) => {
  const err = new Error(msg);
  err.statusCode = 400;
  return err;
};

/** One file -> { name, parsed } or { name, error }. `pages` (already read) is for tests. */
const readFile = async ({ name, buffer, pages: given }) => {
  try {
    const pages = given || await readPages(buffer);
    const parsed = parsePages(pages);
    if (!parsed.tests.length) return { name, error: 'no VALD test results found (is this a VALD Hub report?)' };
    return { name, parsed };
  } catch (e) {
    return { name, error: `could not be read (${e.message})` };
  }
};

/**
 * files:    [{ name, buffer }]
 * sport:    football | padel | cricket | custom
 * mappings: admin VALD test mappings (custom only: which stat a test feeds)
 * Returns { athlete, files, review, problems, tests, additionalVald,
 *           customTests (custom only) }.
 */
const valdPdfForForm = async ({ files, sport, mappings = {} }) => {
  if (!SPORTS.includes(sport)) throw badRequest('Unknown sport for the VALD PDF');
  if (!files.length) throw badRequest('Upload a VALD Hub PDF');
  const master = masterList();
  // Custom sessions have no fixed battery: every VALD battery test can be scored.
  const battery = sport === 'custom' ? valdBattery() : loadConfig(sport).tests;

  const read = await Promise.all(files.map(readFile));
  const problems = [];
  const review = [];
  const tests = {};
  const additionalVald = [];
  let athlete = null;

  for (const f of read) {
    if (f.error) { problems.push({ level: 'error', file: f.name, test: null, text: `${f.name}: ${f.error}` }); continue; }
    const p = f.parsed;
    const a = p.athlete || {};
    // Test date only when the PDF prints one; its Report Date is when the PDF was made.
    if (!athlete) athlete = { name: a.name || '', dob: toIsoDate(a.dob || ''), testDate: toIsoDate(a.testDate || ''), reportDate: toIsoDate(a.reportDate || '') };
    else if (a.name && athlete.name && slug(a.name) !== slug(athlete.name)) {
      problems.push({ level: 'error', file: f.name, test: null, text: `${f.name} is for ${a.name}, not ${athlete.name}` });
      continue;
    }

    const out = pdfToResults(p, battery, master);
    const byTest = new Map(out.matched.map(m => [m.test, m]));
    const unmatched = new Set(out.unmatched.map(u => u.test));

    for (const t of p.tests) {
      const m = byTest.get(t.test);
      const scoredHere = m && out.tests[m.key] && !tests[m.key];
      let goesTo;
      if (scoredHere) goesTo = { kind: 'battery', key: m.key, label: m.label };
      else if (m && tests[m.key]) goesTo = { kind: 'shown', label: 'Shown, not scored (already filled from another PDF)' };
      else if (m) goesTo = { kind: 'shown', label: sport === 'custom' ? 'Shown, not scored' : `Shown, not scored (not in the ${SPORT_NAMES[sport]} battery)` };
      else goesTo = { kind: 'shown', label: 'Shown, not scored (not in our test list)' };

      for (const r of t.results) {
        review.push({ file: f.name, test: t.test, master: m ? m.label : null, device: t.device, side: r.side, value: r.value, unit: r.unit, percentile: r.percentile, band: r.band, goesTo });
      }

      // What the tester should look at.
      for (const w of t.warnings) problems.push({ level: 'error', file: f.name, test: t.test, text: `${t.test}: ${w}` });
      if (unmatched.has(t.test)) problems.push({ level: 'warn', file: f.name, test: t.test, text: `${t.test}: not in our test list, so it is shown on the report but not scored` });
      if (m) for (const n of m.notes) if (!/no percentile or band/.test(n)) problems.push({ level: 'warn', file: f.name, test: t.test, text: `${t.test}: ${n}` });
      if (scoredHere && !t.results.some(r => r.percentile !== null || r.band !== null)) {
        problems.push({ level: 'info', file: f.name, test: t.test, text: `${m.label}: VALD gave no percentile or band, so it is measured, not rated` });
      } else if (scoredHere && t.results.some(r => r.value !== null && r.percentile === null && r.band === null)) {
        problems.push({ level: 'error', file: f.name, test: t.test, text: `${m.label}: VALD's rating is missing for one side. Enter it by hand` });
      }
    }
    for (const n of out.notes) problems.push({ level: 'error', file: f.name, test: null, text: n });

    for (const [k, v] of Object.entries(out.tests)) if (!tests[k]) tests[k] = v;
    additionalVald.push(...out.additionalVald.filter(r => !(r.test in tests)).map(r => ({ ...r, source: 'vald_pdf' })));
  }

  if (!athlete) throw badRequest(problems.map(p => p.text).join('; ') || 'No VALD results found in the PDF');

  const result = { athlete, files: read.map(f => ({ name: f.name, ok: !f.error, tests: f.parsed ? f.parsed.tests.length : 0 })), review, problems, tests };

  if (sport !== 'custom') {
    const missing = Object.keys(battery).filter(k => battery[k].source === 'vald' && !tests[k]);
    for (const k of missing) problems.push({ level: 'info', file: null, test: ALL_TEST_INFO[k].label, text: `${ALL_TEST_INFO[k].label}: not in the PDF. Enter it by hand or mark it not done` });
    return { ...result, additionalVald };
  }

  // Custom: every PDF test becomes a session test (battery tests by their
  // own key; others by a key from their device and name), with its stat
  // from the admin's VALD test mapping or the battery's usual stat.
  const all = valdBattery();
  const customTests = [];
  for (const [key, t] of Object.entries(tests)) {
    const valdKey = `${all[key].dynamo ? 'dynamo' : 'humantrak'}:${slug(ALL_TEST_INFO[key].label)}`;
    customTests.push({ key, kind: 'vald', valdKey, batteryKey: key, device: all[key].dynamo ? 'Dynamo' : 'HumanTrak', label: null, bilateral: !!all[key].bilateral, date: athlete.testDate, ...valdStat(valdKey, key, mappings, all) });
  }
  for (const r of additionalVald) {
    const valdKey = `${r.device === 'Dynamo' ? 'dynamo' : 'humantrak'}:${slug(r.test)}`;
    const key = customKeyFor(valdKey);
    if (tests[key]) continue;
    const bilateral = r.left !== undefined || r.right !== undefined;
    tests[key] = {
      status: 'completed', source: 'vald_pdf',
      ...Object.fromEntries(['left', 'right', 'value', 'percentile_left', 'percentile_right', 'percentile', 'band_left', 'band_right', 'band']
        .filter(k => r[k] !== undefined && r[k] !== null).map(k => [k, r[k]]))
    };
    customTests.push({ key, kind: 'vald', valdKey, batteryKey: null, device: r.device, label: r.test, unit: r.unit, bilateral, date: r.date, ...valdStat(valdKey, null, mappings, all) });
  }
  return { ...result, tests, customTests, additionalVald: [] };
};

/**
 * VALD Hub PDFs -> a client card (VALD machine tests only), for the tester
 * to check before saving: every test read, the stat it feeds, and every test
 * that couldn't be read or matched. Nothing is filled by hand.
 *   sport: football | padel | cricket | general
 * Returns { athlete, files, review, problems, tests } (tests: machine card input).
 */
const valdPdfForClient = async ({ files, sport }) => {
  const { machineTestsFromPdf, clientRoleOf, SPORTS: CLIENT_SPORTS } = require('../machineCard.service');
  if (!CLIENT_SPORTS.includes(sport)) throw badRequest('Unknown sport for the client card');
  if (!files.length) throw badRequest('Upload a VALD Hub PDF');
  const roleOf = clientRoleOf(sport);
  const read = await Promise.all(files.map(readFile));
  const problems = [];
  const review = [];
  const tests = [];
  let athlete = null;
  for (const f of read) {
    if (f.error) { problems.push({ level: 'error', file: f.name, test: null, text: `${f.name}: ${f.error}` }); continue; }
    const p = f.parsed;
    const a = p.athlete || {};
    if (!athlete) athlete = { name: a.name || '', dob: toIsoDate(a.dob || ''), testDate: toIsoDate(a.testDate || ''), reportDate: toIsoDate(a.reportDate || ''), age: a.age ?? null };
    else if (a.name && athlete.name && slug(a.name) !== slug(athlete.name)) {
      problems.push({ level: 'error', file: f.name, test: null, text: `${f.name} is for ${a.name}, not ${athlete.name}` });
      continue;
    }
    const machine = machineTestsFromPdf(p);
    p.tests.forEach((t, i) => {
      const m = machine[i];
      const dup = tests.some(x => x.label === m.label);
      const role = dup ? null : roleOf(m);
      const goesTo = dup ? { kind: 'shown', label: 'Already read from another PDF' }
        : role && !/^Shown/.test(role) ? { kind: 'battery', key: m.key, label: role }
          : { kind: 'shown', label: role || 'Additional result (shown, not scored)' };
      for (const r of t.results) review.push({ file: f.name, test: t.test, master: m.label, device: t.device, side: r.side, value: r.value, unit: r.unit, percentile: r.percentile, band: r.band, goesTo });
      for (const w of t.warnings) problems.push({ level: 'error', file: f.name, test: t.test, text: `${t.test}: ${w}` });
      if (!dup && !role) problems.push({ level: 'warn', file: f.name, test: t.test, text: `${t.test}: not a card test, so it is shown as an additional result and not scored` });
      if (!dup && role && goesTo.kind === 'battery' && !t.results.some(r => r.percentile !== null || r.band !== null)) {
        problems.push({ level: 'info', file: f.name, test: t.test, text: `${m.label}: VALD gave no percentile or band, so it is measured, not rated` });
      }
      if (!dup) tests.push(m);
    });
  }
  if (!athlete) throw badRequest(problems.map(p => p.text).join('; ') || 'No VALD results found in the PDF');
  if (!athlete.testDate) {
    problems.push({ level: 'warn', file: null, test: null, text: `Session date: the PDF doesn't print the test date${athlete.reportDate ? ` (its Report Date, ${athlete.reportDate}, is when the PDF was made)` : ''}. Enter the date the athlete was tested.` });
  }
  // Card stats this PDF can't score: shown as "Not tested" on the card.
  const roles = tests.map(roleOf).filter(Boolean).filter(r => !/^Shown/.test(r)).join(' | ');
  for (const [stat, needs] of [['Strength', 'the battery\'s Dynamo strength tests'], ['Balance', 'Single Leg Squat'], ['Movement', 'Overhead Squat'], ['Mobility', 'a VALD-rated trunk, shoulder, hip or ankle mobility test']]) {
    if (!roles.includes(stat)) problems.push({ level: 'info', file: null, test: stat, text: `${stat}: not in this PDF (needs ${needs}), so it shows as "Not tested"` });
  }
  return { athlete, files: read.map(f => ({ name: f.name, ok: !f.error, tests: f.parsed ? f.parsed.tests.length : 0 })), review, problems, tests };
};

module.exports = { valdPdfForForm, valdPdfForClient, masterList };

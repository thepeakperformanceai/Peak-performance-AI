// Apple / Google Wallet pass for a report, made through Passcreator.
//
// Setup (environment variables on the backend):
//   PASSCREATOR_API_KEY       API key from Passcreator (Settings → API)
//   PASSCREATOR_TEMPLATE_ID   the Rating Card template's ID (template → Settings)
//   PUBLIC_API_URL            this backend's public address, e.g.
//                             https://peakperformance-staging.onrender.com
//                             (Passcreator downloads the strip image from here)
//   PASSCREATOR_PROPERTY_NAMES  optional JSON, only if a template's
//                             Personalization fields are named differently,
//                             e.g. {"fullName":"Fullname"}
//
// The template's Personalization fields must exist with these names (default):
//   Sport, FirstName, FullName, Tested, RetestBy, Fix, Email

const crypto = require('crypto');
const axios = require('axios');
const { stripDataFromScoring } = require('./walletStrip.service');

const PASSCREATOR_URL = 'https://app.passcreator.com';

const DEFAULT_PROPERTY_NAMES = {
  sport: 'Sport', firstName: 'FirstName', fullName: 'FullName', tested: 'Tested',
  retestBy: 'RetestBy', fix: 'Fix', email: 'Email'
};

const propertyNames = () => {
  try {
    return { ...DEFAULT_PROPERTY_NAMES, ...JSON.parse(process.env.PASSCREATOR_PROPERTY_NAMES || '{}') };
  } catch (_) {
    return DEFAULT_PROPERTY_NAMES;
  }
};

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const RETEST_WEEKS = 6;

// One plain line per stat, used when the tester doesn't write their own #1 fix.
const FIX_LINES = {
  strength: 'Strength. Building it is the fastest way to raise your rating.',
  symmetry: 'Left vs right balance. Evening out your sides lifts your rating and protects you from injury.',
  movement: 'Movement quality. Cleaner movement means more power with less strain.',
  mobility: 'Mobility. More range of motion lets you move freely and hit harder.',
  balance: 'Balance. Better control on one leg makes every movement more stable.',
  speed: 'Speed. Faster first steps win more points.',
  agility: 'Agility. Sharper changes of direction win more points.',
  power: 'Power. More explosive force makes everything you do faster.',
  endurance: 'Endurance. A bigger engine keeps your level up for longer.',
  reaction: 'Reaction time. Faster reactions win more points.'
};

/** "22 OCT" (no year — keeps the pass row short). */
const shortDate = (d) => `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]}`;

/** The report's test date as a Date; falls back to when it was created. */
const testDateOf = (report) => {
  const raw = report.testDate;
  if (raw) {
    // dd/mm/yyyy (how the upload form usually writes it)
    const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(String(raw).trim());
    if (dmy) {
      const d = new Date(Date.UTC(+dmy[3], +dmy[2] - 1, +dmy[1]));
      if (!Number.isNaN(d.getTime())) return d;
    }
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  }
  const c = new Date(report.createdAt || Date.now());
  return new Date(Date.UTC(c.getFullYear(), c.getMonth(), c.getDate()));
};

/** Lowest scored stat's line. */
const defaultFix = (scoring) => {
  const { stats } = stripDataFromScoring(scoring);
  const scored = stats.filter(s => s.value !== null).sort((a, b) => a.value - b.value);
  if (!scored.length) return '';
  return FIX_LINES[scored[0].key] || `${scored[0].label}. Improving it is the fastest way to raise your rating.`;
};

const sportOf = (report) => {
  const s = String(report.reportContent?.sport || report.sport || '').replace(/^client-/i, '').trim();
  if (!s || /^general/i.test(s)) return 'GENERAL FITNESS';
  return s.toUpperCase();
};

/**
 * The values that fill the template's placeholders.
 * overrides: { retestBy: 'YYYY-MM-DD', fix: '...', email: '...' } from the tester.
 */
const passValues = (report, overrides = {}) => {
  const fullName = String(report.athleteName || '').trim().replace(/\s+/g, ' ');
  const tested = testDateOf(report);
  let retest;
  if (overrides.retestBy) {
    retest = new Date(`${overrides.retestBy}T00:00:00Z`);
    if (Number.isNaN(retest.getTime())) {
      const err = new Error('Retest date is not a valid date');
      err.statusCode = 400;
      throw err;
    }
  } else {
    retest = new Date(tested.getTime() + RETEST_WEEKS * 7 * 24 * 3600 * 1000);
  }
  return {
    sport: sportOf(report),
    firstName: (fullName.split(' ')[0] || fullName).toUpperCase(),
    fullName,
    tested: shortDate(tested),
    retestBy: shortDate(retest),
    fix: (overrides.fix && String(overrides.fix).trim()) || defaultFix(report.scoring),
    email: (overrides.email && String(overrides.email).trim()) || ''
  };
};

/** Passcreator request body (property names → values, plus the strip image). */
const passBody = (values, stripUrl, { sendEmail = false } = {}) => {
  const names = propertyNames();
  const body = {};
  for (const [k, v] of Object.entries(values)) {
    if (k === 'email' && !v) continue;
    body[names[k]] = v;
  }
  body.urlToBackground = stripUrl;
  if (sendEmail && values.email) body.emailRecipient = values.email;
  return body;
};

const config = () => {
  const apiKey = process.env.PASSCREATOR_API_KEY;
  const templateId = process.env.PASSCREATOR_TEMPLATE_ID;
  if (!apiKey || !templateId) {
    const err = new Error('Wallet cards aren\'t set up yet: PASSCREATOR_API_KEY and PASSCREATOR_TEMPLATE_ID are missing on the server.');
    err.statusCode = 503;
    throw err;
  }
  return { apiKey, templateId };
};

const passcreatorError = (e) => {
  const detail = e.response?.data?.ErrorMessage || e.response?.data?.message || e.response?.data || e.message;
  const err = new Error(`Passcreator: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
  err.statusCode = 502;
  return err;
};

/** Creates a new pass. Returns { identifier, link }. */
const createPass = async (body) => {
  const { apiKey, templateId } = config();
  try {
    const r = await axios.post(`${PASSCREATOR_URL}/api/pass`, body, {
      params: { passtemplate: templateId, zapierStyle: true },
      headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
      timeout: 30000
    });
    return { identifier: r.data.identifier, link: r.data.linkToPassPage };
  } catch (e) {
    throw passcreatorError(e);
  }
};

/** Updates an existing pass in place (the athlete's Wallet card refreshes, with a notification where the template has a change message). */
const updatePass = async (identifier, body) => {
  const { apiKey } = config();
  try {
    await axios.post(`${PASSCREATOR_URL}/api/pass/${encodeURIComponent(identifier)}`, body, {
      params: { zapierStyle: true },
      headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
      timeout: 30000
    });
  } catch (e) {
    throw passcreatorError(e);
  }
};

const newImageToken = () => crypto.randomBytes(24).toString('hex');

module.exports = {
  passValues, passBody, createPass, updatePass, newImageToken, defaultFix, testDateOf, shortDate, sportOf,
  propertyNames, DEFAULT_PROPERTY_NAMES, RETEST_WEEKS
};

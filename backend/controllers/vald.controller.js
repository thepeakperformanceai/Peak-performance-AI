// controllers/vald.controller.js
// VALD auto-fill for the test form. Read-only; credentials stay server-side.

const { createValdClient } = require('../services/vald/valdClient');
const { searchProfiles: searchByName, normalize } = require('../services/vald/valdSearch');
const ValdLink = require('../models/ValdLink.model');
const { mapLatestResults } = require('../services/vald/valdMapping');
const { loadConfig } = require('../scoring/scoring');

const SPORTS = ['football', 'padel', 'cricket'];

// One client per process, so the login token is reused between requests.
let client = null;
const vald = () => (client = client || createValdClient());

const badRequest = (msg) => {
  const err = new Error(msg);
  err.statusCode = 400;
  return err;
};

/** GET /api/vald/status — is VALD configured and reachable? */
const getStatus = async (req, res, next) => {
  try {
    res.json(await vald().status());
  } catch (e) {
    res.json({ configured: true, connected: false, error: e.message });
  }
};

/** GET /api/vald/diagnose — which VALD calls succeed or fail (no secrets). */
const diagnose = async (req, res, next) => {
  try {
    res.json(await vald().diagnose());
  } catch (e) {
    next(e);
  }
};

// Adds the latest Dynamo/HumanTrak test date to each profile. If test dates
// can't be read, the list still shows (without them).
const withLastTest = async (profiles) => {
  let dates = new Map();
  try { dates = await vald().lastTestDates(); } catch { /* list without dates */ }
  return profiles.map(p => ({ ...p, lastTest: dates.get(p.profileId) || null }));
};

/**
 * GET /api/vald/profiles?q=name — find the athlete in VALD. Forgiving: case,
 * accents, extra spaces, first/last/both names, close spellings suggested.
 * An empty q lists athletes A–Z. `total` is how many VALD profiles were searched.
 */
const searchProfiles = async (req, res, next) => {
  try {
    const all = await vald().listProfiles();
    const { matches, suggestions } = searchByName(all, String(req.query.q || ''));
    res.json({
      profiles: await withLastTest(matches.slice(0, 50)),
      suggestions: await withLastTest(suggestions),
      matches: matches.length,
      total: all.length
    });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/vald/link?name=... — the VALD profile saved for this athlete, if
 * any, checked against VALD so a deleted profile isn't used.
 */
const getLink = async (req, res, next) => {
  try {
    const nameKey = normalize(req.query.name);
    if (!nameKey) return res.json({ link: null });
    const link = await ValdLink.findOne({ nameKey }).lean();
    if (!link) return res.json({ link: null });
    const profile = (await vald().listProfiles()).find(p => p.profileId === link.valdProfileId);
    if (!profile) return res.json({ link: null, stale: true });
    const [withDate] = await withLastTest([profile]);
    res.json({ link: { ...withDate, athleteName: link.athleteName } });
  } catch (e) {
    next(e);
  }
};

/** PUT /api/vald/link { athleteName, profileId } — remember the pick. */
const saveLink = async (req, res, next) => {
  try {
    const athleteName = String(req.body?.athleteName || '').trim();
    const profileId = String(req.body?.profileId || '').trim();
    const nameKey = normalize(athleteName);
    if (!nameKey) throw badRequest('athleteName is required');
    if (!profileId) throw badRequest('profileId is required');
    const profile = (await vald().listProfiles()).find(p => p.profileId === profileId);
    if (!profile) throw badRequest('That VALD profile was not found');
    await ValdLink.findOneAndUpdate(
      { nameKey },
      { nameKey, athleteName, valdProfileId: profileId, valdName: profile.name, dateOfBirth: profile.dateOfBirth, linkedBy: req.user?._id },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ saved: true });
  } catch (e) {
    next(e);
  }
};

/** GET /api/vald/latest?profileId=...&sport=football — form fills for that sport. */
const getLatest = async (req, res, next) => {
  try {
    const profileId = String(req.query.profileId || '').trim();
    const sport = String(req.query.sport || '').trim().toLowerCase();
    if (!profileId) throw badRequest('profileId is required');
    if (!SPORTS.includes(sport)) throw badRequest(`sport must be one of ${SPORTS.join(', ')}`);
    const [dynamo, humantrak] = await Promise.all([
      vald().dynamoTests(profileId),
      vald().humantrakTests(profileId)
    ]);
    res.json(mapLatestResults({ dynamo, humantrak }, loadConfig(sport).tests));
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/vald/raw?profileId=... (admins only) — the athlete's latest raw
 * VALD tests, trimmed, so the field mapping can be checked against real data.
 */
const getRaw = async (req, res, next) => {
  try {
    const profileId = String(req.query.profileId || '').trim();
    if (!profileId) throw badRequest('profileId is required');
    const [dynamo, humantrak] = await Promise.all([
      vald().dynamoTests(profileId),
      vald().humantrakTests(profileId)
    ]);
    res.json({ dynamo: dynamo.slice(0, 5), humantrak: humantrak.slice(0, 5) });
  } catch (e) {
    next(e);
  }
};

module.exports = { getStatus, diagnose, searchProfiles, getLink, saveLink, getLatest, getRaw };

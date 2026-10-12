// controllers/vald.controller.js
// VALD auto-fill for the test form. Read-only; credentials stay server-side.

const { createValdClient } = require('../services/vald/valdClient');
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

/** GET /api/vald/profiles?q=name — find the athlete in VALD. */
const searchProfiles = async (req, res, next) => {
  try {
    const profiles = await vald().searchProfiles(String(req.query.q || ''));
    res.json({ profiles: profiles.slice(0, 25) });
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

module.exports = { getStatus, searchProfiles, getLatest, getRaw };

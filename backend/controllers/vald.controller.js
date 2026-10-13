// controllers/vald.controller.js
// VALD auto-fill for the test form. Read-only; credentials stay server-side.

const { createValdClient } = require('../services/vald/valdClient');
const { searchProfiles: searchByName, normalize } = require('../services/vald/valdSearch');
const ValdLink = require('../models/ValdLink.model');
const { mapLatestResults, testTypesSeen, rawRows } = require('../services/vald/valdMapping');
const ValdTestMapping = require('../models/ValdTestMapping.model');
const { loadConfig } = require('../scoring/scoring');

const SPORTS = ['football', 'padel', 'cricket'];
const { valdFormTests, valdBattery } = require('../services/customAssessment.service');

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

// Admin choices by VALD test key.
const loadMappings = async () =>
  Object.fromEntries((await ValdTestMapping.find({}).lean()).map(m => [m.key, { use: m.use, stat: m.stat, metric: m.metric }]));

/**
 * GET /api/vald/latest?profileId=...&sport=football — every VALD test for the
 * athlete: battery results to fill the form, and all other tests as
 * "additional" results (shown on the report, never in the OVR).
 */
const getLatest = async (req, res, next) => {
  try {
    const profileId = String(req.query.profileId || '').trim();
    const sport = String(req.query.sport || '').trim().toLowerCase();
    if (!profileId) throw badRequest('profileId is required');
    if (sport !== 'custom' && !SPORTS.includes(sport)) throw badRequest(`sport must be one of ${SPORTS.join(', ')}, custom`);
    const [data, mappings] = await Promise.all([vald().athleteTests(profileId), loadMappings()]);
    if (sport === 'custom') {
      // Custom assessment: every latest VALD test becomes a form test, with
      // the stat it feeds (from VALD test mapping) or none (shown only).
      const mapped = mapLatestResults(data, valdBattery(), mappings);
      return res.json(valdFormTests(mapped, mappings));
    }
    res.json(mapLatestResults(data, loadConfig(sport).tests, mappings));
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/vald/raw?profileId=... (admins only) — the athlete's raw VALD
 * tests, one row per test and side: name, body region, movement, side, date.
 */
const getRaw = async (req, res, next) => {
  try {
    const profileId = String(req.query.profileId || '').trim();
    if (!profileId) throw badRequest('profileId is required');
    const data = await vald().athleteTests(profileId);
    res.json({ rows: rawRows(data), dynamoTests: data.dynamo.length, humantrakTests: data.humantrak.length });
  } catch (e) {
    next(e);
  }
};

// Which sports' batteries a VALD test type fills (built in, by name).
const BATTERY_SPORTS = (battery) => SPORTS.filter(sp => battery && loadConfig(sp).tests[battery]);

/**
 * GET /api/vald/mappings (admins only) — every VALD test type in the
 * organisation's tests, with the admin's choice (if any).
 */
const listMappings = async (req, res, next) => {
  try {
    const client = vald();
    const [dynamo, humantrak, testTypes, mappings] = await Promise.all([
      client.allTests('dynamo'), client.allTests('humantrak'),
      client.humantrakTestTypes().catch(() => []), loadMappings()
    ]);
    const types = testTypesSeen({ dynamo, humantrak, testTypes }).map(t => ({
      ...t,
      batterySports: BATTERY_SPORTS(t.battery),
      mapping: mappings[t.key] || null
    }));
    res.json({ stats: ValdTestMapping.STATS, types });
  } catch (e) {
    next(e);
  }
};

/** PUT /api/vald/mappings/:key (admins only) { use, stat, metric, device, test } */
const saveMapping = async (req, res, next) => {
  try {
    const key = String(req.params.key || '').trim();
    const { use, stat = null, metric = null, device, test = '' } = req.body || {};
    if (!/^(dynamo|humantrak):[\w.-]{1,120}$/.test(key)) throw badRequest('Unknown VALD test key');
    if (!['stat', 'show'].includes(use)) throw badRequest('use must be "stat" or "show"');
    if (use === 'stat' && !ValdTestMapping.STATS.includes(stat)) throw badRequest(`stat must be one of ${ValdTestMapping.STATS.join(', ')}`);
    const dev = key.startsWith('dynamo:') ? 'Dynamo' : 'HumanTrak';
    if (device && device !== dev) throw badRequest('device does not match the test key');
    const saved = await ValdTestMapping.findOneAndUpdate(
      { key },
      { key, device: dev, test: String(test).slice(0, 200), use, stat: use === 'stat' ? stat : null,
        metric: dev === 'HumanTrak' && metric ? String(metric).slice(0, 120) : null, updatedBy: req.user?._id },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    res.json({ mapping: { use: saved.use, stat: saved.stat, metric: saved.metric } });
  } catch (e) {
    next(e);
  }
};

/** DELETE /api/vald/mappings/:key (admins only) — back to unmapped. */
const deleteMapping = async (req, res, next) => {
  try {
    await ValdTestMapping.deleteOne({ key: String(req.params.key || '') });
    res.json({ deleted: true });
  } catch (e) {
    next(e);
  }
};

module.exports = { getStatus, diagnose, searchProfiles, getLink, saveLink, getLatest, getRaw, listMappings, saveMapping, deleteMapping };

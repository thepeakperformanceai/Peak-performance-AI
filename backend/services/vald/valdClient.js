// services/vald/valdClient.js
// VALD External API client (read-only): login, tenant, profiles, and the
// latest HumanTrak and Dynamo tests for one athlete.
//
// Credentials come only from environment variables and never leave the
// backend. Hosts follow VALD's regional pattern
//   https://prd-{region}-api-{service}.valdperformance.com
// (region: aue | use | euw). Every URL can be overridden by an env variable
// in case VALD renames a service.
//
// Auth (VALD, March 2026): OAuth2 client credentials at
// https://auth.prd.vald.com/oauth/token with audience "vald-api-external".

const axios = require('axios');

const REGIONS = ['aue', 'use', 'euw'];

const readConfig = (env = process.env) => {
  const region = (env.VALD_REGION || '').trim().toLowerCase();
  const host = (service) => `https://prd-${region}-api-${service}.valdperformance.com`;
  return {
    clientId: (env.VALD_CLIENT_ID || '').trim(),
    clientSecret: (env.VALD_CLIENT_SECRET || '').trim(),
    region,
    tenantId: (env.VALD_TENANT_ID || '').trim() || null,
    authUrl: env.VALD_AUTH_URL || 'https://auth.prd.vald.com/oauth/token',
    audience: env.VALD_AUDIENCE || 'vald-api-external',
    tenantsUrl: env.VALD_TENANTS_URL || host('externaltenants'),
    profilesUrl: env.VALD_PROFILES_URL || host('externalprofile'),
    dynamoUrl: env.VALD_DYNAMO_URL || host('extdynamo'),
    humantrakUrl: env.VALD_HUMANTRAK_URL || host('externalhumantrakv2'),
    lookbackDays: Number(env.VALD_LOOKBACK_DAYS) || 365
  };
};

// What is missing for the integration to work (no secrets in the output).
const configProblems = (cfg) => {
  const problems = [];
  if (!cfg.clientId) problems.push('VALD_CLIENT_ID is not set');
  if (!cfg.clientSecret) problems.push('VALD_CLIENT_SECRET is not set');
  if (!REGIONS.includes(cfg.region)) problems.push('VALD_REGION must be one of aue, use, euw');
  return problems;
};

const valdError = (message, statusCode = 502) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

// Lists come back in a few shapes across VALD services.
const asList = (data, ...keys) => {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  for (const k of keys) if (Array.isArray(data[k])) return data[k];
  return [];
};

/**
 * createValdClient({ env, http }) — http defaults to axios; tests inject a fake.
 */
const createValdClient = ({ env = process.env, http = axios, now = () => Date.now() } = {}) => {
  const cfg = readConfig(env);
  let token = null;        // { value, expiresAt }
  let tenantId = cfg.tenantId;

  const ensureConfigured = () => {
    const problems = configProblems(cfg);
    if (problems.length) throw valdError(`VALD is not configured: ${problems.join('; ')}.`, 503);
  };

  const getToken = async () => {
    ensureConfigured();
    if (token && token.expiresAt - 60_000 > now()) return token.value;
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      audience: cfg.audience
    }).toString();
    let res;
    try {
      res = await http.post(cfg.authUrl, body, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 20000
      });
    } catch (e) {
      const status = e.response?.status;
      throw valdError(status === 401 || status === 403
        ? 'VALD rejected the client ID / secret. Check VALD_CLIENT_ID and VALD_CLIENT_SECRET.'
        : `Could not reach VALD login (${status || e.code || e.message}).`);
    }
    const value = res.data?.access_token;
    if (!value) throw valdError('VALD login returned no access token.');
    token = { value, expiresAt: now() + (Number(res.data.expires_in) || 3600) * 1000 };
    return value;
  };

  const get = async (url, params) => {
    const bearer = await getToken();
    try {
      const res = await http.get(url, {
        params,
        headers: { Authorization: `Bearer ${bearer}`, Accept: 'application/json' },
        timeout: 30000,
        validateStatus: (s) => (s >= 200 && s < 300)
      });
      return res.status === 204 ? null : res.data;
    } catch (e) {
      const status = e.response?.status;
      if (status === 404) return null;
      throw valdError(`VALD request failed (${status || e.code || e.message}) for ${new URL(url).pathname}.`);
    }
  };

  // The tenant (organisation) your credentials can read. Uses VALD_TENANT_ID
  // if set, otherwise the first tenant VALD returns.
  const getTenantId = async () => {
    if (tenantId) return tenantId;
    const data = await get(`${cfg.tenantsUrl}/tenants`);
    const tenants = asList(data, 'tenants', 'items');
    if (!tenants.length) throw valdError('VALD returned no tenants for these credentials (check VALD_REGION).', 502);
    tenantId = tenants[0].id || tenants[0].tenantId;
    return tenantId;
  };

  const sinceIso = () => new Date(now() - cfg.lookbackDays * 86400000).toISOString();

  // Athlete profiles, optionally filtered by name.
  const searchProfiles = async (query = '') => {
    const TenantId = await getTenantId();
    const data = await get(`${cfg.profilesUrl}/profiles`, { TenantId });
    const q = query.trim().toLowerCase();
    return asList(data, 'profiles', 'items')
      .map(p => ({
        profileId: p.profileId || p.id,
        name: [p.givenName, p.familyName].filter(Boolean).join(' ') || p.name || '',
        dateOfBirth: p.dateOfBirth || null,
        externalId: p.externalId || null
      }))
      // Match the start of the full name or of any word in it ("ali" finds
      // "Ali Khan", not "Sara Malik").
      .filter(p => {
        if (!p.profileId) return false;
        if (!q) return true;
        const name = p.name.toLowerCase();
        return name.startsWith(q) || name.split(/\s+/).some(w => w.startsWith(q));
      });
  };

  // Dynamo tests for one profile, newest first.
  const dynamoTests = async (profileId) => {
    const teamId = await getTenantId();
    const data = await get(`${cfg.dynamoUrl}/v2022q2/teams/${teamId}/tests`, { modifiedFromUtc: sinceIso() });
    return asList(data, 'items', 'tests')
      .filter(t => (t.athleteId || t.profileId) === profileId)
      .sort((a, b) => String(b.startTimeUTC || b.testDateUtc || b.startDateUtc || '').localeCompare(
        String(a.startTimeUTC || a.testDateUtc || a.startDateUtc || '')));
  };

  // HumanTrak tests for one profile (pages forward by modifiedDateUtc until 204), newest first.
  const humantrakTests = async (profileId) => {
    const TenantId = await getTenantId();
    let from = sinceIso();
    const all = [];
    for (let page = 0; page < 20; page++) {
      const data = await get(`${cfg.humantrakUrl}/v2/tests-by-modified-date`, { TenantId, ModifiedFromUtc: from, ProfileId: profileId });
      const tests = asList(data, 'tests', 'items');
      if (!tests.length) break;
      all.push(...tests);
      const last = tests[tests.length - 1].modifiedDateUtc;
      if (!last || last === from) break;
      from = last;                                   // exact value, never rounded (per VALD guide)
    }
    return all
      .filter(t => !t.profileId || t.profileId === profileId)
      .sort((a, b) => String(b.startDateUtc || b.testDateUtc || '').localeCompare(String(a.startDateUtc || a.testDateUtc || '')));
  };

  // Login + tenant check, for the status endpoint (no secrets returned).
  const status = async () => {
    const problems = configProblems(cfg);
    if (problems.length) return { configured: false, problems, region: cfg.region || null };
    await getToken();
    const t = await getTenantId();
    return { configured: true, connected: true, region: cfg.region, tenantId: t };
  };

  return { cfg, getToken, getTenantId, searchProfiles, dynamoTests, humantrakTests, status };
};

module.exports = { createValdClient, readConfig, configProblems };

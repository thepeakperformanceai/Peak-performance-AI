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
//
// Calls, parameter names and headers match VALD's own R package (valdr 3.x):
//   Profiles   GET {profile}/profiles?tenantId=
//   Dynamo     GET {dynamo}/v1/test/tests-by-modified-date?TenantId=&ModifiedFromUtc=
//   HumanTrak  GET {humantrak}/v2/tests-by-modified-date?TenantId=&ModifiedFromUtc=
// Both test lists page forward by the last test's modifiedDateUtc until 204.
// valdr never calls /tenants; it needs the tenant ID (VALD Hub Organization ID).

const axios = require('axios');
const { searchProfiles: searchByName } = require('./valdSearch');

const REGIONS = ['aue', 'use', 'euw'];
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Tolerate a tenant ID pasted with quotes, braces or spaces.
const cleanId = (v) => String(v || '').trim().replace(/^["'{\s]+|["'}\s]+$/g, '');

// VALD wants UTC timestamps without milliseconds (2026-10-01T00:00:00Z).
const utc = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

const readConfig = (env = process.env) => {
  const region = (env.VALD_REGION || '').trim().toLowerCase();
  const host = (service) => `https://prd-${region}-api-${service}.valdperformance.com`;
  return {
    clientId: (env.VALD_CLIENT_ID || '').trim(),
    clientSecret: (env.VALD_CLIENT_SECRET || '').trim(),
    region,
    tenantId: cleanId(env.VALD_TENANT_ID) || null,
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

// Short, readable reason from a VALD error response (body text or the
// WWW-Authenticate header). VALD error bodies hold no credentials.
const reason = (res) => {
  if (!res) return '';
  const auth = res.headers?.['www-authenticate'];
  let body = res.data;
  if (body && typeof body === 'object') body = body.message || body.title || body.detail || body.error_description || body.error || JSON.stringify(body);
  body = String(body || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return [auth && `WWW-Authenticate: ${auth}`, body].filter(Boolean).join(' · ').slice(0, 200);
};

// Non-secret facts about the access token, to see what VALD granted it.
// Never returns the token, the client ID or any claim values except
// issuer and audience.
const tokenFacts = (jwt, tenantId) => {
  try {
    const claims = JSON.parse(Buffer.from(String(jwt).split('.')[1], 'base64url').toString('utf8'));
    const facts = { issuer: claims.iss || null, audience: claims.aud || null, claims: Object.keys(claims).join(', ') };
    if (tenantId) facts.tenantInToken = JSON.stringify(claims).toLowerCase().includes(tenantId.toLowerCase()) ? 'yes' : 'no';
    return facts;
  } catch {
    return { note: 'token is not a readable JWT' };
  }
};

// Name search (kept for callers that only want the matches).
const matchProfiles = (profiles, query = '') => searchByName(profiles, query).matches;

const testDate = (t) => t.startTimeUTC || t.testDateUtc || t.startDateUtc || t.recordedDateUtc || t.modifiedDateUtc || null;

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

  // Same headers valdr sends (it identifies itself with Client-Name/-Version).
  const headers = (bearer) => ({
    Authorization: `Bearer ${bearer}`,
    Accept: 'application/json',
    'Client-Name': 'PeakPerformance',
    'Client-Version': '1.0',
    'User-Agent': 'PeakPerformance/1.0'
  });

  const get = async (url, params) => {
    const bearer = await getToken();
    try {
      const res = await http.get(url, {
        params,
        headers: headers(bearer),
        timeout: 30000,
        validateStatus: (s) => (s >= 200 && s < 300)
      });
      return res.status === 204 ? null : res.data;
    } catch (e) {
      const status = e.response?.status;
      if (status === 404) return null;
      const why = reason(e.response);
      const err = valdError(`VALD request failed (${status || e.code || e.message}) for ${new URL(url).pathname}${why ? `: ${why}` : ''}.`);
      err.valdStatus = status || null;
      throw err;
    }
  };

  // Pages a tests-by-modified-date list forward until VALD answers 204.
  const testsSince = async (url, fromMs, listKeys) => {
    const TenantId = await getTenantId();
    let from = utc(fromMs);
    const all = [];
    for (let page = 0; page < 20; page++) {
      const tests = asList(await get(url, { TenantId, ModifiedFromUtc: from }), ...listKeys);
      if (!tests.length) break;
      all.push(...tests);
      const last = tests[tests.length - 1].modifiedDateUtc;
      if (!last || last === from) break;
      from = last;                                   // exact value, never rounded (per VALD guide)
    }
    // The cursor date can be inclusive, so the same test may come back twice.
    const seen = new Set();
    return all.filter(t => {
      const id = t.testId || t.id;
      if (!id) return true;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  };

  // The tenant (organisation) your credentials can read. Uses VALD_TENANT_ID
  // if set, otherwise the first tenant VALD returns.
  const getTenantId = async () => {
    if (tenantId) return tenantId;
    let data;
    try {
      data = await get(`${cfg.tenantsUrl}/tenants`);
    } catch (e) {
      if (e.valdStatus === 403) {
        throw valdError('VALD login worked, but these credentials are not allowed to list tenants (403 on /tenants). ' +
          'Set VALD_TENANT_ID on the backend to skip this step, or run the VALD check to see which calls work.', 502);
      }
      throw e;
    }
    const tenants = asList(data, 'tenants', 'items');
    if (!tenants.length) throw valdError('VALD returned no tenants for these credentials (check VALD_REGION).', 502);
    tenantId = tenants[0].id || tenants[0].tenantId;
    return tenantId;
  };

  const since = () => now() - cfg.lookbackDays * 86400000;

  // Every athlete profile in the tenant, sorted by name.
  const listProfiles = async () => {
    const tenantId = await getTenantId();
    const data = await get(`${cfg.profilesUrl}/profiles`, { tenantId });
    return asList(data, 'profiles', 'items')
      .map(p => ({
        profileId: p.profileId || p.id,
        name: [p.givenName, p.familyName].filter(Boolean).join(' ').trim() || p.name || '',
        dateOfBirth: p.dateOfBirth || null,
        externalId: p.externalId || null
      }))
      .filter(p => p.profileId)
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  // Athlete profiles, optionally filtered by name (see matchProfiles).
  const searchProfiles = async (query = '') => matchProfiles(await listProfiles(), query);

  // Latest Dynamo / HumanTrak test date per profile, across the tenant, for
  // the search list. One paged pass per device; cached for 10 minutes.
  let lastTests = null;    // { at, map }
  const lastTestDates = async () => {
    if (lastTests && now() - lastTests.at < 10 * 60_000) return lastTests.map;
    const [dynamo, humantrak] = await Promise.all([
      testsSince(`${cfg.dynamoUrl}/v1/test/tests-by-modified-date`, since(), ['tests', 'items']),
      testsSince(`${cfg.humantrakUrl}/v2/tests-by-modified-date`, since(), ['testResults', 'tests', 'items'])
    ]);
    const map = new Map();
    const add = (t, device) => {
      const id = t.profileId || t.athleteId;
      const date = testDate(t);
      if (!id || !date) return;
      const cur = map.get(id);
      if (!cur || String(date) > String(cur.date)) map.set(id, { date, device });
    };
    dynamo.forEach(t => add(t, 'Dynamo'));
    humantrak.forEach(t => add(t, 'HumanTrak'));
    lastTests = { at: now(), map };
    return map;
  };

  // Dynamo tests for one profile, newest first.
  const dynamoTests = async (profileId) => {
    const all = await testsSince(`${cfg.dynamoUrl}/v1/test/tests-by-modified-date`, since(), ['tests', 'items']);
    return all
      .filter(t => (t.athleteId || t.profileId) === profileId)
      .sort((a, b) => String(b.startTimeUTC || b.testDateUtc || b.startDateUtc || '').localeCompare(
        String(a.startTimeUTC || a.testDateUtc || a.startDateUtc || '')));
  };

  // HumanTrak tests for one profile, newest first. VALD has no profile
  // filter on this call, so the tenant's tests are filtered here.
  const humantrakTests = async (profileId) => {
    const all = await testsSince(`${cfg.humantrakUrl}/v2/tests-by-modified-date`, since(), ['testResults', 'tests', 'items']);
    return all
      .filter(t => (t.profileId || t.athleteId) === profileId)
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

  /**
   * Step-by-step check of every VALD call, for the "Run VALD check" button.
   * Reports HTTP status per call; never returns credentials or tokens.
   * Tenant IDs and names are included (not secret) so VALD_TENANT_ID can be set.
   */
  const diagnose = async () => {
    const steps = [];
    const where = (url) => { const u = new URL(url); return `${u.host}${u.pathname}`; };
    steps.push({
      step: 'Configuration', ok: configProblems(cfg).length === 0,
      detail: {
        VALD_CLIENT_ID: cfg.clientId ? 'set' : 'missing',
        VALD_CLIENT_SECRET: cfg.clientSecret ? 'set' : 'missing',
        VALD_REGION: cfg.region || 'missing',
        VALD_TENANT_ID: !cfg.tenantId ? 'not set' : GUID.test(cfg.tenantId) ? 'set' : 'set, but not a GUID (check the value)'
      }
    });
    if (!cfg.clientId || !cfg.clientSecret) return { steps, advice: 'Set VALD_CLIENT_ID and VALD_CLIENT_SECRET on the backend.' };

    // 1. Login (always fresh, so the result reflects the credentials now).
    token = null;
    let bearer = null;
    try {
      bearer = await getToken();
      steps.push({ step: 'Login (token)', call: where(cfg.authUrl), ok: true, status: 200,
        detail: { result: `token received, valid ${Math.round((token.expiresAt - now()) / 60000)} min`, ...tokenFacts(bearer, cfg.tenantId) } });
    } catch (e) {
      steps.push({ step: 'Login (token)', call: where(cfg.authUrl), ok: false, detail: e.message });
      return { steps, advice: 'Login failed: check VALD_CLIENT_ID / VALD_CLIENT_SECRET (or VALD_AUTH_URL if VALD gave you a different login address).' };
    }

    const probe = async (step, url, params) => {
      try {
        const res = await http.get(url, {
          params, timeout: 30000, validateStatus: () => true,
          headers: headers(bearer)
        });
        const ok = res.status >= 200 && res.status < 300;
        const out = { step, call: where(url), ok, status: res.status };
        if (!ok && reason(res)) out.detail = reason(res);
        steps.push(out);
        return { ok, status: res.status, data: res.status === 204 ? null : res.data, out };
      } catch (e) {
        steps.push({ step, call: where(url), ok: false, detail: e.code || e.message });
        return { ok: false };
      }
    };

    // 2. Tenants in every region (configured region first). Only needed to
    // find the tenant ID; valdr never calls it.
    const regions = [cfg.region, ...REGIONS.filter(r => r !== cfg.region)].filter(r => REGIONS.includes(r));
    const tenantsByRegion = {};
    for (const r of regions) {
      const url = env.VALD_TENANTS_URL && r === cfg.region ? `${cfg.tenantsUrl}/tenants` : `https://prd-${r}-api-externaltenants.valdperformance.com/tenants`;
      const t = await probe(`Tenants (${r}${r === cfg.region ? ', configured' : ''})`, url);
      if (t.ok) {
        const list = asList(t.data, 'tenants', 'items').map(x => ({ id: x.id || x.tenantId, name: x.name || null }));
        t.out.detail = list.length ? `${list.length} tenant(s): ${list.map(x => `${x.name || 'unnamed'} = ${x.id}`).join('; ')}` : 'no tenants in this region';
        tenantsByRegion[r] = list;
      }
    }

    // 3-5. Profiles, Dynamo, HumanTrak with the tenant we would use.
    const tid = cfg.tenantId || (tenantsByRegion[cfg.region] || [])[0]?.id || null;
    const from = utc(now() - 30 * 86400000);
    if (tid) {
      // Which VALD organisation the app reads athletes from (IDs and names are not secret).
      const listed = Object.entries(tenantsByRegion).flatMap(([r, list]) => list.map(t => ({ ...t, r })));
      const used = listed.find(t => String(t.id).toLowerCase() === String(tid).toLowerCase());
      steps.push({
        step: 'Organisation used', ok: true,
        detail: used
          ? `${used.name || 'unnamed'} (${used.id}, region ${used.r})${cfg.tenantId ? ' = VALD_TENANT_ID' : ''}`
          : `${tid}${cfg.tenantId ? ' from VALD_TENANT_ID' : ''}; not in the tenant list above${listed.length ? ` (listed: ${listed.map(t => `${t.name || 'unnamed'} = ${t.id} in ${t.r}`).join('; ')})` : ''}`
      });
      const p = await probe('Profiles', `${cfg.profilesUrl}/profiles`, { tenantId: tid });
      if (p.ok) p.out.detail = `${asList(p.data, 'profiles', 'items').length} athlete profile(s)`;
      const d = await probe('Dynamo tests (last 30 days)', `${cfg.dynamoUrl}/v1/test/tests-by-modified-date`, { TenantId: tid, ModifiedFromUtc: from });
      if (d.ok) d.out.detail = d.status === 204 ? 'no tests in the last 30 days' : `${asList(d.data, 'tests', 'items').length} test(s) on the first page`;
      const h = await probe('HumanTrak tests (last 30 days)', `${cfg.humantrakUrl}/v2/tests-by-modified-date`, { TenantId: tid, ModifiedFromUtc: from });
      if (h.ok) h.out.detail = h.status === 204 ? 'no tests in the last 30 days' : `${asList(h.data, 'testResults', 'tests', 'items').length} test(s) on the first page`;
    } else {
      steps.push({ step: 'Profiles / Dynamo / HumanTrak', ok: false, detail: 'skipped: no tenant ID (set VALD_TENANT_ID)' });
    }

    // Advice in plain words.
    const tenantOk = steps.find(s => s.step.startsWith(`Tenants (${cfg.region}`))?.ok;
    const otherRegion = Object.keys(tenantsByRegion).find(r => r !== cfg.region && tenantsByRegion[r].length);
    // With VALD_TENANT_ID set the app never lists tenants, so those rows don't count.
    const failing = steps.filter(s => s.ok === false && !(cfg.tenantId && s.step.startsWith('Tenants'))).map(s => s.step);
    const profilesRefused = steps.find(s => s.step === 'Profiles')?.status === 403;
    let advice;
    if (!failing.length) advice = cfg.tenantId && !tenantOk ? 'Everything the app needs works (listing tenants is refused, but the app does not need it because VALD_TENANT_ID is set).' : 'Everything works.';
    else if (!tenantOk && otherRegion) advice = `Your tenant is in region "${otherRegion}": set VALD_REGION=${otherRegion}.`;
    else if (!tenantOk && !cfg.tenantId) advice = 'Login works, but these credentials cannot list tenants. Set VALD_TENANT_ID to your VALD Hub Organization ID (Management > Organization); the app then skips /tenants.';
    else if (profilesRefused) advice = 'VALD refused the profiles call for this tenant. Check that VALD_TENANT_ID is exactly the VALD Hub Organization ID (Management > Organization) that valdr uses, with no quotes or spaces, and that VALD_REGION matches it. ' +
      `These calls failed: ${failing.join(', ')}.`;
    else advice = `These calls failed: ${failing.join(', ')}. A 403 means the credentials are not allowed to use that API; ask VALD to enable it for your client.`;
    return { steps, advice };
  };

  return { cfg, getToken, getTenantId, listProfiles, searchProfiles, lastTestDates, dynamoTests, humantrakTests, status, diagnose };
};

module.exports = { createValdClient, readConfig, configProblems, matchProfiles };

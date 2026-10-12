// Run: npm test   (from backend/)
// VALD integration: login, tenant, profiles, test retrieval and mapping to the
// test form. VALD is faked here (response shapes from VALD's published guides).

const test = require('node:test');
const assert = require('node:assert/strict');
const { createValdClient, configProblems, readConfig, matchProfiles } = require('./valdClient');
const { mapLatestResults } = require('./valdMapping');
const { loadConfig } = require('../../scoring/scoring');

const ENV = { VALD_CLIENT_ID: 'id-123', VALD_CLIENT_SECRET: 'secret-456', VALD_REGION: 'aue' };
const NOW = Date.parse('2026-10-12T10:00:00Z');

// A fake VALD: routes by URL, records calls.
const fakeVald = (routes) => {
  const calls = [];
  const http = {
    post: async (url, body, opts) => { calls.push({ method: 'POST', url, body, opts }); return routes.token(url, body); },
    get: async (url, opts) => {
      calls.push({ method: 'GET', url, params: opts.params, headers: opts.headers });
      let res = { status: 404, data: null };
      for (const [pattern, handler] of Object.entries(routes)) {
        if (pattern !== 'token' && url.includes(pattern)) { res = handler(opts.params, url); break; }
      }
      // Behave like axios: throw unless validateStatus accepts the status.
      const accept = opts.validateStatus || ((st) => st >= 200 && st < 300);
      if (!accept(res.status)) { const e = new Error(`HTTP ${res.status}`); e.response = res; throw e; }
      return res;
    }
  };
  return { http, calls };
};

const DYNAMO_TESTS = { tests: [
  { id: 'd1', athleteId: 'P1', movement: 'HipExtension', laterality: 'LeftThenRight', startTimeUTC: '2026-10-01T09:00:00Z',
    repetitionTypeSummaries: [
      { movement: 'HipExtension', laterality: 'LeftSide', repCount: 3, maxForceNewtons: 410.24 },
      { movement: 'HipExtension', laterality: 'RightSide', repCount: 3, maxForceNewtons: 395.06 }] },
  { id: 'd0', athleteId: 'P1', movement: 'HipExtension', laterality: 'LeftThenRight', startTimeUTC: '2026-06-01T09:00:00Z',
    repetitionTypeSummaries: [{ laterality: 'LeftSide', maxForceNewtons: 300 }, { laterality: 'RightSide', maxForceNewtons: 290 }] },
  { id: 'd2', athleteId: 'P1', movement: 'KneeExtension', startTimeUTC: '2026-10-01T09:05:00Z',
    repetitionTypeSummaries: [{ laterality: 'LeftSide', maxForceNewtons: 612 }, { laterality: 'RightSide', maxForceNewtons: 533 }] },
  { id: 'd3', athleteId: 'P1', movement: 'KneeFlexion', startTimeUTC: '2026-10-01T09:10:00Z',
    repetitionTypeSummaries: [{ laterality: 'LeftSide', maxForceNewtons: 250 }] },
  { id: 'x9', athleteId: 'OTHER', movement: 'HipExtension', startTimeUTC: '2026-10-05T09:00:00Z',
    repetitionTypeSummaries: [{ laterality: 'LeftSide', maxForceNewtons: 999 }] }
] };

const HT_PAGE = [
  { testId: 'h1', profileId: 'P1', testTypeName: 'Single Leg Stand Eyes Closed', startDateUtc: '2026-10-01T08:00:00Z', modifiedDateUtc: '2026-10-01T08:30:00.1234567Z',
    metrics: [{ name: 'Left Hold Time (s)', value: 18 }, { name: 'Right Hold Time (s)', value: 22 }] },
  { testId: 'h2', profileId: 'P1', testTypeName: 'Overhead Squat', startDateUtc: '2026-10-01T08:10:00Z', modifiedDateUtc: '2026-10-01T08:40:00.7654321Z',
    metrics: [{ name: 'Composite Score', value: 68 }, { name: 'Left Knee Flexion', value: 110 }] },
  { testId: 'h3', profileId: 'P1', testTypeName: 'Trunk Rotation', startDateUtc: '2026-10-01T08:20:00Z', modifiedDateUtc: '2026-10-01T08:50:00.5Z',
    metrics: [{ name: 'Left Rotation Angle', value: 42 }, { name: 'Left Rotation Range', value: 44 }, { name: 'Right Rotation Angle', value: 40 }] }
];

const routes = () => {
  let htCalls = 0;
  let dyCalls = 0;
  return {
    token: () => ({ data: { access_token: 'tok-1', expires_in: 7200 } }),
    '/tenants': () => ({ status: 200, data: { tenants: [{ id: 'T1', name: 'PeakPerformance' }] } }),
    '/profiles': () => ({ status: 200, data: { profiles: [
      { profileId: 'P1', givenName: 'Ali', familyName: 'Khan', dateOfBirth: '2007-03-02' },
      { profileId: 'P2', givenName: 'Sara', familyName: 'Malik' }] } }),
    '/v1/test/tests-by-modified-date': () => (++dyCalls === 1 ? { status: 200, data: DYNAMO_TESTS } : { status: 204, data: '' }),
    '/v2/tests-by-modified-date': () => (++htCalls === 1 ? { status: 200, data: { testResults: HT_PAGE } } : { status: 204, data: '' })
  };
};

test('config: env names, regional hosts, missing-variable messages without secrets', () => {
  const cfg = readConfig(ENV);
  assert.equal(cfg.dynamoUrl, 'https://prd-aue-api-extdynamo.valdperformance.com');
  assert.equal(cfg.humantrakUrl, 'https://prd-aue-api-externalhumantrakv2.valdperformance.com');
  assert.equal(cfg.profilesUrl, 'https://prd-aue-api-externalprofile.valdperformance.com');
  assert.equal(cfg.tenantsUrl, 'https://prd-aue-api-externaltenants.valdperformance.com');
  assert.equal(cfg.authUrl, 'https://auth.prd.vald.com/oauth/token');
  assert.deepEqual(configProblems(readConfig({})), [
    'VALD_CLIENT_ID is not set', 'VALD_CLIENT_SECRET is not set', 'VALD_REGION must be one of aue, use, euw']);
  assert.equal(readConfig({ ...ENV, VALD_DYNAMO_URL: 'https://x.example' }).dynamoUrl, 'https://x.example');
});

test('login: client credentials with audience; token cached until near expiry', async () => {
  const { http, calls } = fakeVald(routes());
  let t = NOW;
  const c = createValdClient({ env: ENV, http, now: () => t });
  assert.equal(await c.getToken(), 'tok-1');
  await c.getToken();
  const posts = calls.filter(x => x.method === 'POST');
  assert.equal(posts.length, 1);
  const body = new URLSearchParams(posts[0].body);
  assert.deepEqual(Object.fromEntries(body), { grant_type: 'client_credentials', client_id: 'id-123', client_secret: 'secret-456', audience: 'vald-api-external' });
  t += 7200 * 1000;                                    // expired
  await c.getToken();
  assert.equal(calls.filter(x => x.method === 'POST').length, 2);
});

test('login rejected gives a clear message; unconfigured gives 503', async () => {
  const http = { post: async () => { const e = new Error('x'); e.response = { status: 401 }; throw e; } };
  await assert.rejects(createValdClient({ env: ENV, http }).getToken(), /rejected the client ID/);
  await assert.rejects(createValdClient({ env: {}, http }).getToken(), (e) => e.statusCode === 503 && /VALD_CLIENT_ID is not set/.test(e.message));
});

test('status never returns credentials', async () => {
  const { http } = fakeVald(routes());
  const st = await createValdClient({ env: ENV, http, now: () => NOW }).status();
  assert.deepEqual(st, { configured: true, connected: true, region: 'aue', tenantId: 'T1' });
  assert.equal(JSON.stringify(st).includes('secret'), false);
});

test('tenant from VALD_TENANT_ID skips the tenants call', async () => {
  const { http, calls } = fakeVald(routes());
  const c = createValdClient({ env: { ...ENV, VALD_TENANT_ID: 'T1' }, http, now: () => NOW });
  await c.searchProfiles('');
  assert.equal(calls.some(x => x.url.includes('/tenants')), false);
});

test('profiles: bearer token, tenant param, name search', async () => {
  const { http, calls } = fakeVald(routes());
  const c = createValdClient({ env: ENV, http, now: () => NOW });
  const found = await c.searchProfiles('ali');
  assert.deepEqual(found, [{ profileId: 'P1', name: 'Ali Khan', dateOfBirth: '2007-03-02', externalId: null }]);
  const call = calls.find(x => x.url.endsWith('/profiles'));
  assert.equal(call.headers.Authorization, 'Bearer tok-1');
  assert.equal(call.headers['Client-Name'], 'PeakPerformance');      // valdr sends Client-Name too
  assert.deepEqual(call.params, { tenantId: 'T1' });                 // camelCase, as valdr sends it
});

test('dynamo and humantrak: only this athlete, newest first; humantrak pages until 204', async () => {
  const { http, calls } = fakeVald(routes());
  const c = createValdClient({ env: ENV, http, now: () => NOW });
  const d = await c.dynamoTests('P1');
  assert.deepEqual(d.map(t => t.id), ['d3', 'd2', 'd1', 'd0']);
  const h = await c.humantrakTests('P1');
  assert.deepEqual(h.map(t => t.testId), ['h3', 'h2', 'h1']);
  const htCalls = calls.filter(x => x.url.includes('humantrak'));
  assert.equal(htCalls.length, 2);
  assert.equal(htCalls[1].params.ModifiedFromUtc, '2026-10-01T08:50:00.5Z');   // exact, not rounded
  // Same call valdr makes: tenant + start date (UTC, no milliseconds), no profile filter.
  assert.deepEqual(htCalls[0].params, { TenantId: 'T1', ModifiedFromUtc: '2025-10-12T10:00:00Z' });
  const dyCall = calls.find(x => x.url.includes('extdynamo'));
  assert.equal(dyCall.url, 'https://prd-aue-api-extdynamo.valdperformance.com/v1/test/tests-by-modified-date');
  assert.deepEqual(dyCall.params, { TenantId: 'T1', ModifiedFromUtc: '2025-10-12T10:00:00Z' });
});

test('mapping (football): latest Dynamo max force per side; HumanTrak by test type', async () => {
  const { http } = fakeVald(routes());
  const c = createValdClient({ env: ENV, http, now: () => NOW });
  const out = mapLatestResults({ dynamo: await c.dynamoTests('P1'), humantrak: await c.humantrakTests('P1') }, loadConfig('football').tests);
  assert.deepEqual(out.fills, {
    single_leg_stand: { left: 18, right: 22 },
    overhead_squat: { value: 68 },
    hip_extension: { left: 410.2, right: 395.1 },     // newest test, not the June one
    knee_extension: { left: 612, right: 533 }
  });
  assert.equal(out.sources.hip_extension.testId, 'd1');
  // Trunk rotation has two "left" candidates (angle and range): not guessed.
  assert.deepEqual(out.missing, ['trunk_rotation']);
  const trunk = out.unmatched.find(u => u.test === 'Trunk Rotation');
  assert.match(trunk.reason, /enter by hand/);
  assert.deepEqual(trunk.metrics, ['Left Rotation Angle', 'Left Rotation Range', 'Right Rotation Angle']);
  assert.ok(out.unmatched.some(u => u.test === 'KneeFlexion' && u.reason === 'movement not recognised'));
});

test('mapping (padel/cricket): only tests in that battery are filled', async () => {
  const { http } = fakeVald(routes());
  const c = createValdClient({ env: ENV, http, now: () => NOW });
  const data = { dynamo: await c.dynamoTests('P1'), humantrak: await c.humantrakTests('P1') };
  const padel = mapLatestResults(data, loadConfig('padel').tests);
  assert.deepEqual(Object.keys(padel.fills).sort(), ['overhead_squat', 'single_leg_stand']);
  assert.deepEqual(padel.missing, ['trunk_rotation', 'shoulder_er', 'hip_abduction', 'hip_adduction']);
  assert.ok(padel.unmatched.some(u => u.test === 'HipExtension' && u.reason === 'not in this battery'));
  const cricket = mapLatestResults(data, loadConfig('cricket').tests);
  assert.deepEqual(cricket.fills.hip_extension, { left: 410.2, right: 395.1 });
  assert.equal(cricket.fills.overhead_squat, undefined);            // not in the cricket battery
});

test('mapping: one side only is kept; no cut-offs are ever invented', () => {
  const out = mapLatestResults({ dynamo: [
    { id: 'a', movement: 'Hip Abduction', repetitionTypeSummaries: [{ laterality: 'LeftSide', maxForceNewtons: 260 }] }
  ], humantrak: [] }, loadConfig('padel').tests);
  assert.deepEqual(out.fills.hip_abduction, { left: 260 });
  assert.equal(JSON.stringify(out.fills).includes('cutoff'), false);
  assert.equal(JSON.stringify(out.fills).includes('band'), false);
});

// ---------- diagnosing a 403 on /tenants (as seen on staging) ----------

const forbidTenants = (overrides = {}) => ({
  ...routes(),
  '/tenants': () => ({ status: 403, data: { message: 'Forbidden' } }),
  ...overrides
});

test('403 on /tenants: clear message pointing to VALD_TENANT_ID', async () => {
  const { http } = fakeVald(forbidTenants());
  const c = createValdClient({ env: ENV, http, now: () => NOW });
  await assert.rejects(c.status(), /login worked.*not allowed to list tenants.*VALD_TENANT_ID/);
});

test('VALD_TENANT_ID set: status connects without calling /tenants', async () => {
  const { http, calls } = fakeVald(forbidTenants());
  const c = createValdClient({ env: { ...ENV, VALD_TENANT_ID: 'T1' }, http, now: () => NOW });
  assert.deepEqual(await c.status(), { configured: true, connected: true, region: 'aue', tenantId: 'T1' });
  assert.equal(calls.some(x => x.url.includes('/tenants')), false);
  const found = await c.searchProfiles('ali');
  assert.equal(found[0].profileId, 'P1');
});

test('diagnose: login ok, tenants 403 in all regions -> advice to set VALD_TENANT_ID; no secrets', async () => {
  const { http } = fakeVald(forbidTenants());
  const out = await createValdClient({ env: ENV, http, now: () => NOW }).diagnose();
  const by = Object.fromEntries(out.steps.map(x => [x.step, x]));
  assert.equal(by['Login (token)'].ok, true);
  assert.equal(by['Tenants (aue, configured)'].status, 403);
  assert.equal(by['Tenants (use)'].status, 403);
  assert.equal(by['Profiles / Dynamo / HumanTrak'].ok, false);
  assert.match(out.advice, /Set VALD_TENANT_ID to your VALD Hub Organization ID/);
  const text = JSON.stringify(out);
  assert.equal(text.includes('secret-456'), false);
  assert.equal(text.includes('tok-1'), false);
  assert.equal(text.includes('id-123'), false);
  assert.deepEqual(by.Configuration.detail, { VALD_CLIENT_ID: 'set', VALD_CLIENT_SECRET: 'set', VALD_REGION: 'aue', VALD_TENANT_ID: 'not set' });
});

test('diagnose: with VALD_TENANT_ID, reports profiles / Dynamo / HumanTrak calls', async () => {
  const { http } = fakeVald(forbidTenants());
  const out = await createValdClient({ env: { ...ENV, VALD_TENANT_ID: 'T1' }, http, now: () => NOW }).diagnose();
  const by = Object.fromEntries(out.steps.map(x => [x.step, x]));
  assert.equal(by.Profiles.ok, true);
  assert.equal(by.Profiles.detail, '2 athlete profile(s)');
  assert.equal(by['Dynamo tests (last 30 days)'].ok, true);
  assert.equal(by['HumanTrak tests (last 30 days)'].ok, true);
  assert.match(out.advice, /Everything the app needs works/);     // only the tenants listing fails, and it isn't needed
});

test('humantrak: other athletes in the tenant are filtered out', async () => {
  const { http } = fakeVald({ ...routes(), '/v2/tests-by-modified-date': () => ({ status: 200, data: { testResults: [
    { testId: 'mine', profileId: 'P1', modifiedDateUtc: '2026-10-01T08:00:00Z' },
    { testId: 'theirs', profileId: 'P2', modifiedDateUtc: '2026-10-01T09:00:00Z' }] } }) });
  const c = createValdClient({ env: { ...ENV, VALD_TENANT_ID: 'T1' }, http, now: () => NOW });
  assert.deepEqual((await c.humantrakTests('P1')).map(t => t.testId), ['mine']);
});

test('tenant ID pasted with quotes or spaces is cleaned', () => {
  const id = '0a1b2c3d-1111-2222-3333-444455556666';
  assert.equal(readConfig({ ...ENV, VALD_TENANT_ID: ` "${id}" ` }).tenantId, id);
  assert.equal(readConfig({ ...ENV, VALD_TENANT_ID: `{${id}}` }).tenantId, id);
});

test('diagnose: 403 on profiles shows VALD\'s reason and tenant advice; token facts hold no secrets', async () => {
  const id = '0a1b2c3d-1111-2222-3333-444455556666';
  const jwt = ['x', Buffer.from(JSON.stringify({ iss: 'https://auth.prd.vald.com/', aud: 'vald-api-external', azp: 'id-123', tenants: [id] })).toString('base64url'), 'sig'].join('.');
  const { http } = fakeVald(forbidTenants({
    token: () => ({ data: { access_token: jwt, expires_in: 3600 } }),
    '/profiles': () => ({ status: 403, data: { message: 'Tenant access denied' }, headers: {} })
  }));
  const out = await createValdClient({ env: { ...ENV, VALD_TENANT_ID: id }, http, now: () => NOW }).diagnose();
  const by = Object.fromEntries(out.steps.map(x => [x.step, x]));
  assert.equal(by.Profiles.status, 403);
  assert.equal(by.Profiles.detail, 'Tenant access denied');
  assert.match(out.advice, /VALD Hub Organization ID/);
  assert.equal(by['Login (token)'].detail.tenantInToken, 'yes');
  assert.equal(by['Login (token)'].detail.audience, 'vald-api-external');
  const text = JSON.stringify(out);
  assert.equal(text.includes('id-123'), false);       // client ID claim value never shown
  assert.equal(text.includes(jwt), false);
});

test('diagnose: tenant found in another region -> advice names the right VALD_REGION', async () => {
  const { http } = fakeVald(forbidTenants({
    '/tenants': (p, url) => (url.includes('prd-euw-') ? { status: 200, data: { tenants: [{ id: 'T9', name: 'PeakPerformance' }] } } : { status: 403, data: null })
  }));
  const out = await createValdClient({ env: ENV, http, now: () => NOW }).diagnose();
  assert.match(out.advice, /set VALD_REGION=euw/);
  assert.match(out.steps.find(x => x.step === 'Tenants (euw)').detail, /PeakPerformance = T9/);
});

test('diagnose: rejected credentials stop at login', async () => {
  const http = { post: async () => { const e = new Error('x'); e.response = { status: 401 }; throw e; }, get: async () => { throw new Error('should not be called'); } };
  const out = await createValdClient({ env: ENV, http, now: () => NOW }).diagnose();
  assert.equal(out.steps.at(-1).step, 'Login (token)');
  assert.equal(out.steps.at(-1).ok, false);
  assert.match(out.advice, /Login failed/);
});

test('name search: word start, hyphenated names, external ID, then "contains" fallback', () => {
  const people = [
    { profileId: '1', name: 'Ali Khan', externalId: null },
    { profileId: '2', name: 'Sara Malik', externalId: 'PP-7' },
    { profileId: '3', name: 'Mohammad-Faraz Khwaja', externalId: null },
    { profileId: '4', name: 'Abdulfaraz Test', externalId: null }];
  assert.deepEqual(matchProfiles(people, 'ali').map(p => p.profileId), ['1']);
  assert.deepEqual(matchProfiles(people, 'faraz').map(p => p.profileId), ['3']);      // hyphenated word start
  assert.deepEqual(matchProfiles(people, 'pp-7').map(p => p.profileId), ['2']);       // external ID
  assert.deepEqual(matchProfiles(people, 'dulfar').map(p => p.profileId), ['4']);     // contains fallback
  assert.equal(matchProfiles(people, '').length, 4);
});

test('diagnose: names the organisation athletes are read from', async () => {
  const { http } = fakeVald(routes());
  const out = await createValdClient({ env: { ...ENV, VALD_TENANT_ID: 't1' }, http, now: () => NOW }).diagnose();
  assert.equal(out.steps.find(x => x.step === 'Organisation used').detail, 'PeakPerformance (T1, region aue) = VALD_TENANT_ID');
  const other = await createValdClient({ env: { ...ENV, VALD_TENANT_ID: 'T2' }, http: fakeVald(routes()).http, now: () => NOW }).diagnose();
  assert.match(other.steps.find(x => x.step === 'Organisation used').detail, /T2 from VALD_TENANT_ID; not in the tenant list above \(listed: PeakPerformance = T1 in aue;/);
});

// ---------- forgiving athlete search ----------

const { searchProfiles: searchByName, normalize } = require('./valdSearch');

const SQUAD = [
  { profileId: 'a', name: 'Faraz Khawaja', externalId: null },
  { profileId: 'b', name: 'Arhum Latif', externalId: null },
  { profileId: 'c', name: 'José Muñoz', externalId: null },
  { profileId: 'd', name: "Sean O'Brien", externalId: 'PP-12' },
  { profileId: 'e', name: 'Faraz Ahmed', externalId: null },
  { profileId: 'f', name: 'Ali Khan', externalId: null },
  { profileId: 'g', name: 'Sara Malik', externalId: null }];
const ids = (q) => searchByName(SQUAD, q).matches.map(p => p.profileId);

test('search: case, extra spaces and accents are ignored', () => {
  assert.equal(normalize('  Fáraz   KHAWAJA '), 'faraz khawaja');
  assert.deepEqual(ids('faraz khawaja'), ['a']);
  assert.deepEqual(ids('  FARAZ    khawaja  '), ['a']);
  assert.deepEqual(ids('jose munoz'), ['c']);
  assert.deepEqual(ids('obrien'), ['d']);
});

test('search: first name, last name, both, or parts of them', () => {
  assert.deepEqual(ids('Arhum'), ['b']);
  assert.deepEqual(ids('Latif'), ['b']);
  assert.deepEqual(ids('latif arhum'), ['b']);        // either order
  assert.deepEqual(ids('arh lat'), ['b']);            // partial words
  assert.deepEqual(ids('faraz'), ['e', 'a']);         // every match listed, A–Z
  assert.deepEqual(ids('ali'), ['f']);                // word start beats "Malik"
  assert.deepEqual(ids('pp-12'), ['d']);              // external ID
});

test('search: nothing matches -> empty list plus close spellings', () => {
  const out = searchByName(SQUAD, 'faraz kwaja');
  assert.deepEqual(out.matches, []);
  assert.equal(out.suggestions[0].profileId, 'a');
  assert.deepEqual(searchByName(SQUAD, 'zzzzzz'), { matches: [], suggestions: [] });
});

test('last test date per athlete, newest across Dynamo and HumanTrak', async () => {
  const { http } = fakeVald(routes());
  const c = createValdClient({ env: { ...ENV, VALD_TENANT_ID: 'T1' }, http, now: () => NOW });
  const dates = await c.lastTestDates();
  assert.deepEqual(dates.get('P1'), { date: '2026-10-01T09:10:00Z', device: 'Dynamo' });   // Dynamo 09:10 beats HumanTrak 08:20
  assert.deepEqual(dates.get('OTHER'), { date: '2026-10-05T09:00:00Z', device: 'Dynamo' });
});

const test = require('node:test');
const assert = require('node:assert');
const axios = require('axios');
const { renderStrip, stripDataFromScoring } = require('./walletStrip.service');
const walletPass = require('./walletPass.service');

// Ebraheem Hassaan's client card (padel, 22 Oct 2026).
const scoring = {
  ovr: { value: 59 },
  stats: {
    strength: { value: 45 }, symmetry: { value: 73 }, balance: { value: null, from: [] },
    movement: { value: 63 }, mobility: { value: 56 }
  }
};
const report = { athleteName: 'Ebraheem  Hassaan ', sport: 'client-padel', reportContent: { sport: 'Padel' }, testDate: '22/10/2026', scoring };

test('strip data: scored stats first, not-tested last, labels', () => {
  const d = stripDataFromScoring(scoring);
  assert.strictEqual(d.overall, 59);
  assert.deepStrictEqual(d.stats.map(s => `${s.label}:${s.value}`), ['STR:45', 'SYM:73', 'MOV:63', 'MOB:56', 'BAL:null']);
});

test('strip data: hidden and not-in-battery stats are left off', () => {
  const d = stripDataFromScoring({ ovr: { value: 70 }, stats: { strength: { value: 70 }, symmetry: { value: null, hidden: true }, speed: { value: null, status: 'not_in_battery' } } });
  assert.deepStrictEqual(d.stats.map(s => s.label), ['STR']);
});

test('no OVR → no Wallet card', () => {
  assert.throws(() => stripDataFromScoring({ ovr: { value: null }, stats: {} }), /no OVR/);
});

test('strip renders a 1860 x 738 PNG', () => {
  const png = renderStrip(scoring);
  assert.strictEqual(png.subarray(1, 4).toString(), 'PNG');
  assert.strictEqual(png.readUInt32BE(16), 1860);
  assert.strictEqual(png.readUInt32BE(20), 738);
});

test('pass values from the report', () => {
  const v = walletPass.passValues(report);
  assert.deepStrictEqual(v, {
    sport: 'PADEL', firstName: 'EBRAHEEM', fullName: 'Ebraheem Hassaan', tested: '22 OCT', retestBy: '03 DEC',
    fix: 'Strength. Building it is the fastest way to raise your rating.', email: ''
  });
});

test('pass values: tester overrides', () => {
  const v = walletPass.passValues(report, { retestBy: '2026-12-28', fix: 'Hip strength', email: 'a@b.com' });
  assert.strictEqual(v.retestBy, '28 DEC');
  assert.strictEqual(v.fix, 'Hip strength');
  assert.strictEqual(v.email, 'a@b.com');
  assert.throws(() => walletPass.passValues(report, { retestBy: 'soon' }), /not a valid date/);
});

test('general / gym clients show GENERAL FITNESS', () => {
  assert.strictEqual(walletPass.sportOf({ sport: 'client-general' }), 'GENERAL FITNESS');
});

test('Passcreator body uses the template property names', () => {
  const v = walletPass.passValues(report, { email: 'a@b.com' });
  const body = walletPass.passBody(v, 'https://x/strip.png');
  assert.strictEqual(body.FirstName, 'EBRAHEEM');
  assert.strictEqual(body.RetestBy, '03 DEC');
  assert.strictEqual(body.Email, 'a@b.com');
  assert.strictEqual(body.urlToBackground, 'https://x/strip.png');

  process.env.PASSCREATOR_PROPERTY_NAMES = '{"fullName":"Fullname"}';
  try {
    const b2 = walletPass.passBody(v, 'u');
    assert.strictEqual(b2.Fullname, 'Ebraheem Hassaan');
    assert.strictEqual(b2.FullName, undefined);
  } finally {
    delete process.env.PASSCREATOR_PROPERTY_NAMES;
  }
});

test('no email → no Email property', () => {
  const body = walletPass.passBody(walletPass.passValues(report), 'u');
  assert.strictEqual(body.Email, undefined);
});

test('emailPass calls the deliver endpoint', async () => {
  process.env.PASSCREATOR_API_KEY = 'k';
  process.env.PASSCREATOR_TEMPLATE_ID = 't';
  const orig = axios.post;
  let url;
  axios.post = async (u) => { url = u; return { data: {} }; };
  try {
    await walletPass.emailPass('pass-1', 'a+b@c.com');
    assert.strictEqual(url, 'https://app.passcreator.com/api/pass/deliver/pass-1/email/a%2Bb%40c.com');
  } finally {
    axios.post = orig;
    delete process.env.PASSCREATOR_API_KEY;
    delete process.env.PASSCREATOR_TEMPLATE_ID;
  }
});

test('createPass calls Passcreator with the template and API key', async () => {
  process.env.PASSCREATOR_API_KEY = 'key123';
  process.env.PASSCREATOR_TEMPLATE_ID = 'tpl-1';
  const orig = axios.post;
  let seen;
  axios.post = async (url, body, opts) => { seen = { url, body, opts }; return { data: { identifier: 'pass-1', linkToPassPage: 'https://app.passcreator.com/p/1' } }; };
  try {
    const r = await walletPass.createPass({ FirstName: 'X' });
    assert.deepStrictEqual(r, { identifier: 'pass-1', link: 'https://app.passcreator.com/p/1' });
    assert.strictEqual(seen.url, 'https://app.passcreator.com/api/pass');
    assert.strictEqual(seen.opts.params.passtemplate, 'tpl-1');
    assert.strictEqual(seen.opts.headers.Authorization, 'key123');
  } finally {
    axios.post = orig;
    delete process.env.PASSCREATOR_API_KEY;
    delete process.env.PASSCREATOR_TEMPLATE_ID;
  }
});

test('template ID can be pasted as the editor link', async () => {
  process.env.PASSCREATOR_API_KEY = 'k';
  process.env.PASSCREATOR_TEMPLATE_ID = 'https://app.passcreator.com/ui/templates/afbba13a-8fa7-4072-a731-71abc64564ae/editor?view=passInfo';
  const orig = axios.post;
  let params;
  axios.post = async (url, body, opts) => { params = opts.params; return { data: { identifier: 'p', linkToPassPage: 'l' } }; };
  try {
    await walletPass.createPass({});
    assert.strictEqual(params.passtemplate, 'afbba13a-8fa7-4072-a731-71abc64564ae');
  } finally {
    axios.post = orig;
    delete process.env.PASSCREATOR_API_KEY;
    delete process.env.PASSCREATOR_TEMPLATE_ID;
  }
});

test('missing Passcreator settings give a clear error', async () => {
  await assert.rejects(() => walletPass.createPass({}), /aren't set up yet/);
});

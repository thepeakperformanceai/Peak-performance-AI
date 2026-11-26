// Run: node --test hassan/
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { createAgent, HOLDING, BOT_REPLY, NON_TEXT_REPLY } = require('./agent');
const { detectIntent, checkReply, checkMedicalReply, checkFixedPriceReply, serviceWindowOpen, adWindowOpen } = require('./rules');
const { allSlots, slotsToOffer, label, fromPkt } = require('./slots');
const { parseDecision } = require('./brain');
const { validSignature, parseWebhook } = require('./whatsapp');
const { config } = require('./config');
const { buildSystemPrompt } = require('./playbook');

const HOUR = 3600 * 1000;
const cfg = () => ({ ...config(), freeMode: true, freeServiceMessagesPerMonth: 1000, serviceWarnAt: 900,
  whatsapp: { ...config().whatsapp, appSecret: 'shh', templates: { day3: 'pp_day3', day7: 'pp_day7', reminder: 'pp_reminder' } } });

// ── fakes ────────────────────────────────────────────────────────────────────
const memoryStore = () => {
  const leads = new Map(); const bookings = []; const stats = new Map(); let id = 0;
  const copy = (x) => JSON.parse(JSON.stringify(x));
  return {
    leads, bookings, stats,
    async getLead(p) { return leads.has(p) ? copy(leads.get(p)) : null; },
    async saveLead(l) { const s = { _id: l._id || `L${++id}`, ...copy(l) }; leads.set(l.phone, s); return copy(s); },
    async leadsAwaitingFollowUp() { return [...leads.values()].filter(l => !l.paused && ['new', 'qualified', 'slot_offered'].includes(l.stage)).map(copy); },
    async bookingsBetween(a, b) { return bookings.filter(x => new Date(x.start) >= a && new Date(x.start) < b).map(copy); },
    async createBooking(b) { const s = { _id: `B${++id}`, ...copy(b) }; bookings.push(s); return copy(s); },
    async saveBooking(b) { const i = bookings.findIndex(x => x._id === b._id); bookings[i] = copy(b); return copy(b); },
    async getStat(m) { if (!stats.has(m)) stats.set(m, { month: m, serviceSent: 0, templatesSent: 0 }); return copy(stats.get(m)); },
    async bumpStat(m, f) { const s = await this.getStat(m); s[f]++; stats.set(m, s); return copy(s); },
    async setStat(m, f) { const s = { ...(await this.getStat(m)), ...f }; stats.set(m, s); return copy(s); }
  };
};

const fakeWa = () => {
  const sent = [];
  return { sent,
    async sendText(c, to, body) { sent.push({ to, body }); return `out${sent.length}`; },
    async sendTemplate(c, to, name, params) { sent.push({ to, template: name, params }); return `tpl${sent.length}`; },
    async markRead() {} };
};

// brain that replays scripted decisions
const scriptedBrain = (decisions) => {
  const calls = [];
  return { calls, async think(c, input) { calls.push(input); const d = decisions.shift(); if (d instanceof Error) throw d; return { stage: null, leadName: null, service: null, book: null, handoff: null, handoffReason: null, ...d }; } };
};

// Thu 26 Nov 2026, 3:00pm Karachi
const T0 = fromPkt(2026, 10, 26, 15, 0);
const setup = (decisions = [], opts = {}) => {
  let clock = opts.start || T0;
  const store = memoryStore(); const wa = fakeWa(); const brain = scriptedBrain(decisions); const alerts = [];
  const agent = createAgent({ cfg: opts.cfg || cfg(), store, wa, brain, now: () => new Date(clock), alert: async (s, t) => alerts.push(s), log: { error() {} } });
  let n = 0;
  const say = (text, extra = {}) => agent.handleInbound({ id: `in${++n}`, from: '923001234567', profileName: 'Ali Khan', at: new Date(clock), type: 'text', text, ...extra });
  return { agent, store, wa, brain, alerts, say, advance: (ms) => { clock = new Date(clock.getTime() + ms); }, now: () => new Date(clock) };
};

// ── rules ────────────────────────────────────────────────────────────────────
test('pain and injury words are spotted (English and Roman Urdu), no handoff', () => {
  assert.ok(detectIntent('my shoulder feels tight, some pain when I serve').medical);
  assert.ok(detectIntent('ghutne mein dard hai').medical);
  assert.strictEqual(detectIntent('ghutne mein dard hai').handoff, undefined);
  assert.ok(!detectIntent('I want to prevent injuries').medical);
  // pain and price together: both flagged
  const both = detectIntent('knee pain, but 3000 is expensive');
  assert.ok(both.medical && both.pricePushback);
});

test('physio reply check: must send them to the physio, no treatment tips', () => {
  assert.deepStrictEqual(checkMedicalReply("Thanks, I've noted this. You'll need to visit our physiotherapist so it can be assessed. PKR 3,000."), []);
  assert.match(checkMedicalReply('Sorry to hear that! Try some stretches and ice it.').join(), /physio/);
  assert.match(checkMedicalReply('Noted. Ice it tonight and see our physio tomorrow.').join(), /advice/);
});

test('price pushback is spotted (no handoff); partnerships and asking for a person go to Faraz', () => {
  for (const t of ['Can you do 5000?? too expensive', 'thora kam kar dein', 'any discount', 'last price batao']) {
    const i = detectIntent(t);
    assert.ok(i.pricePushback, t); assert.strictEqual(i.handoff, undefined, t);
  }
  for (const t of ['can I talk to someone', 'we want a partnership for our club', 'I want a refund']) {
    assert.strictEqual(detectIntent(t).handoff, 'faraz', t);
  }
  assert.deepStrictEqual(detectIntent('bhai ye test kitne ka hai aur online hota hai?'), {});
});

test('fixed-price reply check', () => {
  assert.deepStrictEqual(checkFixedPriceReply('Our prices are fixed and the same for everyone.'), []);
  assert.deepStrictEqual(checkFixedPriceReply('Bhai price fix hai, sab ke liye same.'), []);
  assert.match(checkFixedPriceReply('Let me see what I can do!').join(), /fixed/);
});

test('bot check is spotted', () => {
  assert.ok(detectIntent('Am I talking to a real person?').botCheck);
  assert.ok(detectIntent('are you a bot').botCheck);
});

test('reply checks: only list prices, no brands, no "online", no discounts', () => {
  const c = cfg();
  assert.deepStrictEqual(checkReply('Full body assessment is PKR 8,000, 30 minutes, in person.', c), []);
  assert.deepStrictEqual(checkReply('Physio is Rs 3000 per session', c), []);
  assert.match(checkReply('Special price PKR 5,000 today', c).join(), /price/);
  assert.match(checkReply('We test you on VALD ForceDecks', c).join(), /brand/);
  assert.match(checkReply('Yes we do it online too', c).join(), /online/);
  assert.deepStrictEqual(checkReply('No, it is not online. In person only.', c), []);
  assert.match(checkReply('I can give you a 20% discount', c).join(), /discount/);
  assert.match(checkReply("Yes I'm a real person", c).join(), /human/);
  assert.deepStrictEqual(checkReply('Call us on +92 303 901 9991', c), []);
});

test('windows: 24h service window and 7-day ad window', () => {
  const c = cfg(); const now = T0.getTime();
  assert.ok(serviceWindowOpen({ lastInboundAt: new Date(now - 23 * HOUR) }, now));
  assert.ok(!serviceWindowOpen({ lastInboundAt: new Date(now - 25 * HOUR) }, now));
  assert.ok(adWindowOpen({ fromAd: true, adEntryAt: new Date(now - 6 * 24 * HOUR) }, now, c));
  assert.ok(!adWindowOpen({ fromAd: true, adEntryAt: new Date(now - 8 * 24 * HOUR) }, now, c));
  assert.ok(!adWindowOpen({ fromAd: false }, now, c));
});

test('slots: evenings in Karachi time, 2h ahead, K7 only Wed/Thu', () => {
  const s = allSlots(cfg(), T0); // Thu 3pm
  assert.strictEqual(s[0].label, 'Thu 26 Nov, 6pm');
  assert.ok(s.every(x => { const h = new Date(x.start.getTime() + 5 * HOUR).getUTCHours(); return h >= 18 && h < 22; }));
  assert.ok(s.filter(x => x.locationId === 'k7').every(x => /^(Wed|Thu)/.test(x.label)));
  assert.strictEqual(label(fromPkt(2026, 10, 28, 18, 30)), 'Sat 28 Nov, 6:30pm');
  const offer = slotsToOffer(cfg(), T0, []);
  assert.ok(offer.length <= cfg().slotsToOffer && offer.length > 2);
});

test('AI output is parsed defensively', () => {
  const d = parseDecision('```json\n{"reply":"Hi","stage":"weird","book":{"slot_id":"lab@x","full_name":" Ali Khan "},"handoff":"nobody"}\n```');
  assert.strictEqual(d.stage, null);
  assert.strictEqual(d.handoff, null);
  assert.deepStrictEqual(d.book, { slotId: 'lab@x', fullName: 'Ali Khan' });
});

test('system prompt carries list prices and the honesty rule', () => {
  const p = buildSystemPrompt(cfg());
  assert.match(p, /PKR 8,000/); assert.match(p, /PKR 3,000/); assert.match(p, /PKR 6,000/); assert.match(p, /PKR 10,000/);
  assert.match(p, /Never pretend to be human/);
  assert.doesNotMatch(p, /30,000/);
});

test('webhook: signature check and ad detection', () => {
  const body = JSON.stringify({ entry: [{ changes: [{ value: {
    contacts: [{ wa_id: '923001234567', profile: { name: 'Ali' } }],
    messages: [{ id: 'wamid.1', from: '923001234567', timestamp: '1795000000', type: 'text', text: { body: 'price?' }, referral: { source_type: 'ad', ctwa_clid: 'x', headline: 'Get your card' } },
               { id: 'wamid.2', from: '923001234567', timestamp: '1795000001', type: 'audio', audio: {} }] } }] }] });
  const sig = 'sha256=' + crypto.createHmac('sha256', 'shh').update(body).digest('hex');
  assert.ok(validSignature(cfg(), Buffer.from(body), sig));
  assert.ok(!validSignature(cfg(), Buffer.from(body), 'sha256=00'));
  const [a, b] = parseWebhook(JSON.parse(body));
  assert.strictEqual(a.fromAd, true); assert.strictEqual(a.profileName, 'Ali'); assert.strictEqual(a.text, 'price?');
  assert.strictEqual(b.text, null); assert.strictEqual(b.type, 'audio');
});

// ── the doc's test script ────────────────────────────────────────────────────
test('Roman Urdu price question: Hassan replies, lead is saved', async () => {
  const h = setup([{ reply: 'Hi, Hassan here from Peak Performance. Full body assessment PKR 8,000 hai, 30 minute, in person. Aap kaun sa sport khelte hain?', stage: 'qualified' }]);
  const r = await h.say('bhai ye test kitne ka hai aur online hota hai?', { fromAd: true });
  assert.strictEqual(r.action, 'replied');
  assert.match(h.wa.sent[0].body, /8,000/);
  const lead = await h.store.getLead('923001234567');
  assert.strictEqual(lead.stage, 'qualified'); assert.ok(lead.fromAd); assert.strictEqual(lead.messages.length, 2);
  // AI got offered slots and the chat
  assert.ok(h.brain.calls[0].slots.length > 0);
  // ad lead: doesn't use the free monthly allowance
  assert.strictEqual((await h.store.getStat('2026-11')).serviceSent, 0);
});

test('padel player with shoulder pain: noted, told to see our physio, offered slots (no handoff)', async () => {
  const h = setup([{ reply: "Thanks for telling me, I've noted this. You'll need to visit our physiotherapist so they can assess it properly. A physio session is PKR 3,000. I have Thu 26 Nov, 6pm or Thu 26 Nov, 6:30pm. Which suits you?", stage: 'slot_offered' }]);
  const r = await h.say('I play padel 4 times a week, my shoulder has pain when I serve');
  assert.strictEqual(r.action, 'replied');
  assert.ok(h.brain.calls[0].medical, 'AI told the lead mentioned pain');
  assert.match(h.wa.sent[0].body, /physiotherapist/);
  const lead = await h.store.getLead('923001234567');
  assert.ok(!lead.paused); assert.strictEqual(lead.service, 'physio'); assert.ok(lead.mentionedPain);
  assert.ok(lead.messages.some(m => m.by === 'system' && /pain or injury/.test(m.text)));
  assert.strictEqual(h.alerts.length, 0);
});

test('pain: AI gives advice twice → standard physio referral with two slots', async () => {
  const h = setup([{ reply: 'Try some stretches and ice it.' }, { reply: 'Rest it for a week, should be fine.' }]);
  const r = await h.say('mere ghutne mein dard hai');
  assert.strictEqual(r.action, 'physio_referral');
  assert.match(h.wa.sent[0].body, /^Thanks for telling me, I've noted this\. The right next step is a visit to our physiotherapist/);
  assert.match(h.wa.sent[0].body, /PKR 3,000\. I have .+ or .+\. Which suits you\?/);
  assert.ok(!(await h.store.getLead('923001234567')).paused);
});

test('pain + AI down → standard physio referral, not a handoff', async () => {
  const h = setup([new Error('quota')]);
  const r = await h.say('back pain after gym');
  assert.strictEqual(r.action, 'physio_referral');
});

test('pain lead books a physio slot', async () => {
  const slot = allSlots(cfg(), T0).find(s => s.locationId === 'lab');
  const h = setup([{ reply: '', book: { slotId: slot.id, fullName: 'Ali Khan' } }]);
  const r = await h.say('my knee hurts, book the first slot please, Ali Khan');
  assert.strictEqual(r.action, 'booked');
  assert.strictEqual(h.store.bookings[0].service, 'physio');
  assert.match(h.wa.sent[0].body, /Physiotherapy session .* PKR 3,000/);
});

test('price push "can you do 5000?": told the price is fixed, offered slots, no handoff', async () => {
  const h = setup([{ reply: 'I understand. Our prices are fixed and the same for everyone: PKR 8,000. In 30 minutes you will know exactly what to work on. Thursday 7pm or Saturday 6:30pm?', stage: 'slot_offered' }]);
  const r = await h.say('Can you do 5000? too expensive');
  assert.strictEqual(r.action, 'replied');
  assert.ok(h.brain.calls[0].priceFixed);
  assert.match(h.wa.sent[0].body, /fixed/);
  const lead = await h.store.getLead('923001234567');
  assert.ok(!lead.paused); assert.strictEqual(h.alerts.length, 0);
});

test('price push: AI offers a deal twice → standard fixed-price reply', async () => {
  const h = setup([{ reply: 'For you, PKR 6,000!' }, { reply: 'Let me check with Faraz what we can do.' }]);
  const r = await h.say('thora kam kar dein bhai');
  assert.strictEqual(r.action, 'fixed_price');
  assert.match(h.wa.sent[0].body, /^I understand\. Our prices are fixed and the same for everyone: the Full Body Assessment is PKR 8,000\. I have .+ or .+\. Which suits you\?$/);
  assert.ok(!h.wa.sent.some(x => /6,000/.test(x.body || '')));
});

test('price push for a physio lead quotes the physio price', async () => {
  const h = setup([{ reply: "Noted. You'll need our physiotherapist to assess it. PKR 3,000. Thu 6pm or 6:30pm?" }, new Error('down')]);
  await h.say('my back hurts');
  const r = await h.say('3000 is too much');
  assert.strictEqual(r.action, 'fixed_price');
  assert.match(h.wa.sent[1].body, /Physiotherapy session is PKR 3,000/);
});

test('"Am I talking to a real person?" gets an honest answer', async () => {
  const h = setup([]);
  await h.say('Am I talking to a real person?');
  assert.strictEqual(h.wa.sent[0].body, BOT_REPLY);
  assert.ok(!(await h.store.getLead('923001234567')).paused);
});

test('voice note: asks them to type', async () => {
  const h = setup([]);
  await h.say(null, { type: 'audio' });
  assert.strictEqual(h.wa.sent[0].body, NON_TEXT_REPLY);
});

test('booking: picks Thursday 7pm → booked, confirmed, slot no longer offered', async () => {
  const slot = allSlots(cfg(), T0).find(s => s.label === 'Thu 26 Nov, 7pm' && s.locationId === 'lab');
  const h = setup([
    { reply: 'I have Thu 26 Nov, 7pm or Thu 26 Nov, 7:30pm. Which suits you?', stage: 'slot_offered', service: 'assessment', leadName: 'Ali' },
    { reply: '', book: { slotId: slot.id, fullName: 'Ali Khan' } },
    { reply: 'Hi there, what do you train?' }
  ]);
  await h.say('I want the full body test');
  const r = await h.say('7pm thursday, Ali Khan');
  assert.strictEqual(r.action, 'booked');
  assert.match(h.wa.sent[1].body, /You're booked, Ali! Full Body Assessment on Thu 26 Nov, 7pm at Peak Performance Lab/);
  assert.match(h.wa.sent[1].body, /PKR 8,000/);
  assert.strictEqual(h.store.bookings.length, 1);
  assert.ok(h.alerts.some(a => /New booking: Ali Khan/.test(a)));
  // someone else can't get the same slot
  h.agent; const other = createAgent({ cfg: cfg(), store: h.store, wa: h.wa, brain: scriptedBrain([{ reply: '', book: { slotId: slot.id, fullName: 'Sara Ahmed' } }]), now: h.now, alert: async () => {}, log: { error() {} } });
  const r2 = await other.handleInbound({ id: 'x1', from: '923339999999', at: h.now(), type: 'text', text: 'Thursday 7pm please, Sara Ahmed' });
  assert.strictEqual(r2.action, 'slot_gone');
  assert.match(h.wa.sent[h.wa.sent.length - 1].body, /just got taken/);
  assert.strictEqual(h.store.bookings.length, 1);
});

test('booking without a full name: asks for it first', async () => {
  const slot = allSlots(cfg(), T0)[0];
  const h = setup([{ reply: '', book: { slotId: slot.id, fullName: '' } }]);
  const r = await h.say('first one');
  assert.strictEqual(r.action, 'ask_name');
  assert.strictEqual(h.store.bookings.length, 0);
});

test('home visit is never self-booked: goes to Faraz', async () => {
  const slot = allSlots(cfg(), T0)[0];
  const h = setup([{ reply: '', service: 'older_adult_home', book: { slotId: slot.id, fullName: 'Zainab Ali' } }]);
  const r = await h.say('Home visit for my father please, Zainab Ali');
  assert.strictEqual(r.action, 'handoff');
  assert.strictEqual(h.store.bookings.length, 0);
});

test('unsafe AI reply is retried, then handed off', async () => {
  const h = setup([{ reply: 'Special for you: PKR 5,000!' }, { reply: 'OK PKR 4,000 then' }]);
  const r = await h.say('how much is it?');
  assert.strictEqual(r.action, 'unsafe_reply');
  assert.strictEqual(h.brain.calls.length, 2);
  assert.match(h.brain.calls[1].feedback, /price/);
  assert.strictEqual(h.wa.sent[0].body, HOLDING.error);
  assert.ok(!h.wa.sent.some(s => /5,000|4,000/.test(s.body || '')));
});

test('unsafe reply fixed on retry is sent', async () => {
  const h = setup([{ reply: 'We use VALD sensors' }, { reply: 'We use lab-grade motion and strength sensors. What do you train?' }]);
  const r = await h.say('what machines do you use');
  assert.strictEqual(r.action, 'replied');
  assert.match(h.wa.sent[0].body, /lab-grade/);
});

test('AI down: holding message + Faraz alerted', async () => {
  const h = setup([new Error('quota')]);
  const r = await h.say('hi');
  assert.strictEqual(r.action, 'ai_error');
  assert.strictEqual(h.wa.sent[0].body, HOLDING.error);
  assert.strictEqual(h.alerts.length, 1);
});

test('duplicate webhook delivery is ignored', async () => {
  const h = setup([{ reply: 'Hi, Hassan here from Peak Performance. What do you train?' }]);
  await h.say('hi', { id: 'same' });
  const r = await h.say('hi', { id: 'same' });
  assert.strictEqual(r.skipped, 'duplicate');
  assert.strictEqual(h.wa.sent.length, 1);
});

// ── free mode ────────────────────────────────────────────────────────────────
test('free mode: non-ad replies stop at the monthly limit, Faraz alerted once', async () => {
  const c = { ...cfg(), freeServiceMessagesPerMonth: 2, serviceWarnAt: 1 };
  const h = setup(Array(5).fill({ reply: 'Hi, Hassan here from Peak Performance. What do you train?' }), { cfg: c });
  await h.say('one'); await h.say('two'); await h.say('three'); await h.say('four');
  assert.strictEqual(h.wa.sent.length, 2);
  assert.strictEqual(h.alerts.filter(a => /limit/.test(a)).length, 2); // "near" once + "hit" once
});

test('follow-ups: same day and day 1 free-form; day 3 template only for ad leads', async () => {
  // ad lead
  const h = setup(Array(3).fill({ reply: 'Hi, Hassan here from Peak Performance. Thursday 7pm or Saturday 6:30pm?', stage: 'slot_offered' }));
  await h.say('price?', { fromAd: true });
  h.advance(1 * HOUR); assert.strictEqual(await h.agent.followUpLead('923001234567'), null);
  h.advance(1.5 * HOUR); assert.strictEqual(await h.agent.followUpLead('923001234567'), 'same_day');
  h.advance(20 * HOUR); assert.strictEqual(await h.agent.followUpLead('923001234567'), 'day1');
  h.advance(50 * HOUR); assert.strictEqual(await h.agent.followUpLead('923001234567'), 'day3');
  assert.strictEqual(h.wa.sent[h.wa.sent.length - 1].template, 'pp_day3');
  h.advance(90 * HOUR); assert.strictEqual(await h.agent.followUpLead('923001234567'), 'day7');
  h.advance(200 * HOUR); assert.strictEqual(await h.agent.followUpLead('923001234567'), null);

  // organic lead: no paid templates in free mode
  const o = setup([{ reply: 'Hi, Hassan here from Peak Performance. What do you train?', stage: 'qualified' }]);
  await o.say('hello');
  o.advance(73 * HOUR);
  for (let i = 0; i < 5; i++) await o.agent.followUpLead('923001234567');
  assert.ok(!o.wa.sent.some(s => s.template), 'no templates for non-ad leads in free mode');
});

test('a reply from the lead resets the follow-up clock', async () => {
  const h = setup(Array(3).fill({ reply: 'Hi, Hassan here from Peak Performance. What do you train?', stage: 'qualified' }));
  await h.say('hi');
  h.advance(3 * HOUR); await h.agent.followUpLead('923001234567');
  await h.say('padel');
  h.advance(1 * HOUR);
  assert.strictEqual(await h.agent.followUpLead('923001234567'), null);
  assert.deepStrictEqual((await h.store.getLead('923001234567')).followUpsSent, []);
});

test('booked and paused leads get no follow-ups', async () => {
  const h = setup([]);
  await h.say('can I talk to someone?'); // → paused
  h.advance(30 * HOUR);
  assert.strictEqual((await h.agent.runScheduled()).followUps, 0);
});

test('reminder: free-form inside the window, template for ad lead outside it', async () => {
  const slot = allSlots(cfg(), new Date(T0.getTime() + 30 * HOUR)).find(s => s.locationId === 'lab'); // Fri/Sat
  const h = setup([{ reply: '', service: 'assessment', book: { slotId: slot.id, fullName: 'Ali Khan' } }]);
  await h.say('book it, Ali Khan', { fromAd: true });
  assert.strictEqual(h.store.bookings.length, 1);
  // move to ~20h before the slot: window from last inbound may be closed
  h.advance(slot.start.getTime() - h.now().getTime() - 20 * HOUR);
  const r = await h.agent.runScheduled();
  assert.strictEqual(r.reminders, 1);
  const last = h.wa.sent[h.wa.sent.length - 1];
  assert.ok(last.body ? /see you/.test(last.body) : last.template === 'pp_reminder');
  // not repeated
  assert.strictEqual((await h.agent.runScheduled()).reminders, 0);
});

test('team reply: works inside 24h, refused after', async () => {
  const h = setup([]);
  await h.say('can I talk to someone?');
  const lead = await h.agent.staffReply('923001234567', 'Hi Ali, Faraz here. Happy to help.');
  assert.strictEqual(lead.messages[lead.messages.length - 1].by, 'staff');
  h.advance(25 * HOUR);
  await assert.rejects(h.agent.staffReply('923001234567', 'hello?'), /24 hours/);
});

test('resume after handoff: Hassan answers again', async () => {
  const h = setup([{ reply: 'Hi, Hassan here from Peak Performance. Thursday or Saturday?' }]);
  await h.say('talk to someone');
  await h.agent.setPaused('923001234567', false);
  const r = await h.say('ok which slots?');
  assert.strictEqual(r.action, 'replied');
});

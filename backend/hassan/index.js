// Plugs Hassan into the Express app: Meta's webhook (public), the Inbox API
// (admins only) and the follow-up timer.
const express = require('express');
const axios = require('axios');
const { config } = require('./config');
const { createAgent } = require('./agent');
const { createCalendar, parseServiceAccount } = require('./calendar');
const { mongoStore } = require('./store');
const brain = require('./brain');
const wa = require('./whatsapp');
const { serviceWindowOpen, adWindowOpen } = require('./rules');
const { sendAlertEmail } = require('../services/email.service');
const HassanBooking = require('../models/HassanBooking.model');

let agent = null;
let calendar;
const getCalendar = () => {
  if (calendar !== undefined) return calendar;
  const cfg = config();
  calendar = createCalendar({ calendarId: cfg.calendarId, serviceAccount: parseServiceAccount(cfg.serviceAccountJson) });
  if (cfg.calendarId && !calendar) console.warn('[hassan] GOOGLE_CALENDAR_ID is set but GOOGLE_SERVICE_ACCOUNT_JSON is missing or unreadable: bookings will not reach the calendar');
  return calendar;
};

const getAgent = () => {
  if (agent) return agent;
  const cfg = config();
  agent = createAgent({
    cfg, store: mongoStore, brain, wa, calendar: getCalendar(),
    alert: (subject, text) => sendAlertEmail(cfg.alertEmail, subject, text).catch(e => console.error('[hassan] alert failed:', e.message))
  });
  return agent;
};

// ── Public webhook: Meta calls this ──────────────────────────────────────────
const webhookRouter = express.Router();

// What the webhook last saw (no secrets), for /status.
const recent = { lastPostAt: null, lastResult: null, lastMessages: 0, posts: 0 };
const keyOk = (req) => { const t = config().whatsapp.verifyToken; return !!t && req.query.key === t; };

// Diagnostics, protected by the verify token: /status?key=… and /connect?key=…&waba=…
webhookRouter.get('/status', (req, res) => {
  if (!keyOk(req)) return res.sendStatus(403);
  const cfg = config();
  res.json({
    hassanEnabled: cfg.enabled,
    hasToken: !!cfg.whatsapp.token, hasPhoneNumberId: !!cfg.whatsapp.phoneNumberId,
    hasAppSecret: !!cfg.whatsapp.appSecret, hasGeminiKey: !!cfg.gemini.key,
    calendarConnected: !!getCalendar(), hasMapsLink: !!cfg.mapsLink,
    webhookPostsSinceRestart: recent.posts, lastPostAt: recent.lastPostAt,
    lastResult: recent.lastResult, lastMessages: recent.lastMessages
  });
});

// Turn Hassan back on for one chat: /resume?key=…&phone=923001234567
webhookRouter.get('/resume', async (req, res) => {
  if (!keyOk(req)) return res.sendStatus(403);
  const phone = String(req.query.phone || '').replace(/\D/g, '');
  if (!phone) return res.status(400).json({ error: 'Add &phone=<number with country code, digits only>' });
  try {
    const lead = await getAgent().setPaused(phone, false);
    res.json({ phone: lead.phone, hassanOn: !lead.paused, stage: lead.stage });
  } catch (e) {
    res.status(e.statusCode || 500).json({ error: e.message });
  }
});

webhookRouter.get('/connect', async (req, res) => {
  if (!keyOk(req)) return res.sendStatus(403);
  const cfg = config();
  const waba = String(req.query.waba || '').replace(/\D/g, '');
  if (!waba) return res.status(400).json({ error: 'Add &waba=<WhatsApp account ID>' });
  try {
    const r = await axios.post(`https://graph.facebook.com/${cfg.whatsapp.apiVersion}/${waba}/subscribed_apps`, {}, { headers: { Authorization: `Bearer ${cfg.whatsapp.token}` }, timeout: 20000 });
    const list = await axios.get(`https://graph.facebook.com/${cfg.whatsapp.apiVersion}/${waba}/subscribed_apps`, { headers: { Authorization: `Bearer ${cfg.whatsapp.token}` }, timeout: 20000 });
    res.json({ subscribed: r.data, appsNowConnected: (list.data?.data || []).map(a => a.whatsapp_business_api_data?.name || a.name || a.id) });
  } catch (e) {
    res.status(502).json({ error: e.response?.data?.error?.message || e.message });
  }
});

// Meta's one-time check when you save the webhook URL.
webhookRouter.get('/', (req, res) => {
  const cfg = config();
  if (req.query['hub.mode'] === 'subscribe' && cfg.whatsapp.verifyToken && req.query['hub.verify_token'] === cfg.whatsapp.verifyToken) {
    return res.status(200).send(req.query['hub.challenge']);
  }
  res.sendStatus(403);
});

webhookRouter.post('/', (req, res) => {
  const cfg = config();
  recent.posts++; recent.lastPostAt = new Date().toISOString();
  if (!wa.validSignature(cfg, req.rawBody, req.get('x-hub-signature-256'))) {
    recent.lastResult = cfg.whatsapp.appSecret ? 'rejected: app secret does not match' : 'rejected: WHATSAPP_APP_SECRET not set';
    console.warn(`[hassan] webhook rejected: signature check failed (${cfg.whatsapp.appSecret ? 'WHATSAPP_APP_SECRET does not match the Meta app secret' : 'WHATSAPP_APP_SECRET is not set'})`);
    return res.sendStatus(401);
  }
  res.sendStatus(200); // answer Meta at once; work happens after

  const messages = wa.parseWebhook(req.body);
  console.log(`[hassan] webhook received: ${messages.length} message(s)`);
  recent.lastResult = 'accepted'; recent.lastMessages = messages.length;
  if (!cfg.enabled) return console.warn('[hassan] HASSAN_ENABLED is not true, so not replying');
  for (const m of messages) {
    console.log(`[hassan] message from ...${String(m.from).slice(-4)} (${m.type})`);
    getAgent().handleInbound(m).catch(e => console.error('[hassan] inbound failed:', e.message));
  }
});

// ── Inbox API: the dashboard (admins only) ───────────────────────────────────
const inboxRouter = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

const summary = (lead, now) => {
  const cfg = config();
  const last = (lead.messages || [])[lead.messages.length - 1];
  return {
    id: lead._id, phone: lead.phone,
    name: lead.fullName || lead.name || lead.profileName || null,
    stage: lead.stage, service: lead.service, paused: lead.paused,
    handoffTo: lead.handoffTo, handoffReason: lead.handoffReason,
    fromAd: lead.fromAd, mentionedPain: !!lead.mentionedPain,
    canReply: serviceWindowOpen(lead, now),
    adWindowOpen: adWindowOpen(lead, now, cfg),
    lastMessage: last ? { by: last.by, text: last.text, at: last.at } : null,
    updatedAt: lead.updatedAt
  };
};

inboxRouter.get('/status', wrap(async (req, res) => {
  const cfg = config();
  const stat = await mongoStore.getStat(new Date().toISOString().slice(0, 7));
  res.json({
    enabled: cfg.enabled, freeMode: cfg.freeMode,
    whatsappConnected: !!(cfg.whatsapp.token && cfg.whatsapp.phoneNumberId && cfg.whatsapp.appSecret),
    aiConnected: !!cfg.gemini.key,
    freeRepliesUsed: stat.serviceSent || 0, freeRepliesLimit: cfg.freeServiceMessagesPerMonth
  });
}));

inboxRouter.get('/leads', wrap(async (req, res) => {
  const now = Date.now();
  const leads = await mongoStore.listLeads();
  res.json(leads.map(l => summary(l, now)));
}));

inboxRouter.get('/leads/:phone', wrap(async (req, res) => {
  const lead = await mongoStore.getLead(req.params.phone);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  res.json({ ...summary(lead, Date.now()), messages: lead.messages });
}));

inboxRouter.post('/leads/:phone/reply', wrap(async (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Type a message first.' });
  if (text.length > 4000) return res.status(400).json({ error: 'Message is too long.' });
  const lead = await getAgent().staffReply(req.params.phone, text);
  res.json({ ...summary(lead, Date.now()), messages: lead.messages });
}));

inboxRouter.post('/start', wrap(async (req, res) => {
  const lead = await getAgent().staffStart(req.body?.phone, req.body?.name);
  res.json({ ...summary(lead, Date.now()), messages: lead.messages });
}));

inboxRouter.post('/leads/:phone/pause', wrap(async (req, res) => {
  const lead = await getAgent().setPaused(req.params.phone, !!req.body?.paused);
  res.json({ ...summary(lead, Date.now()), messages: lead.messages });
}));

inboxRouter.get('/bookings', wrap(async (req, res) => {
  const from = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const bookings = await HassanBooking.find({ start: { $gte: from } }).sort({ start: 1 }).limit(200).lean();
  res.json(bookings);
}));

inboxRouter.post('/bookings/:id/status', wrap(async (req, res) => {
  const status = req.body?.status;
  if (!['booked', 'cancelled', 'done', 'no_show'].includes(status)) return res.status(400).json({ error: 'Unknown status' });
  const b = await HassanBooking.findByIdAndUpdate(req.params.id, { $set: { status } }, { new: true }).lean();
  if (!b) return res.status(404).json({ error: 'Booking not found' });
  if (status === 'cancelled' && b.calendarEventId && getCalendar()) {
    try { await getCalendar().deleteEvent(b.calendarEventId); }
    catch (e) { console.error('[hassan] calendar delete failed:', e.response?.data?.error?.message || e.message); }
  }
  res.json(b);
}));

// ── Timer: follow-ups and reminders every 5 minutes ─────────────────────────
let timer = null;
const startScheduler = (everyMs = 5 * 60 * 1000) => {
  if (timer || !config().enabled) return;
  timer = setInterval(() => {
    getAgent().runScheduled().catch(e => console.error('[hassan] scheduled run failed:', e.message));
  }, everyMs);
  timer.unref?.();
  console.log('[hassan] on: replying to WhatsApp and running follow-ups');
};

module.exports = { webhookRouter, inboxRouter, startScheduler };

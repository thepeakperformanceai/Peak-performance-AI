// Plugs Hassan into the Express app: Meta's webhook (public), the Inbox API
// (admins only) and the follow-up timer.
const express = require('express');
const { config } = require('./config');
const { createAgent } = require('./agent');
const { mongoStore } = require('./store');
const brain = require('./brain');
const wa = require('./whatsapp');
const { serviceWindowOpen, adWindowOpen } = require('./rules');
const { sendAlertEmail } = require('../services/email.service');
const HassanBooking = require('../models/HassanBooking.model');

let agent = null;
const getAgent = () => {
  if (agent) return agent;
  const cfg = config();
  agent = createAgent({
    cfg, store: mongoStore, brain, wa,
    alert: (subject, text) => sendAlertEmail(cfg.alertEmail, subject, text).catch(e => console.error('[hassan] alert failed:', e.message))
  });
  return agent;
};

// ── Public webhook: Meta calls this ──────────────────────────────────────────
const webhookRouter = express.Router();

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
  if (!wa.validSignature(cfg, req.rawBody, req.get('x-hub-signature-256'))) return res.sendStatus(401);
  res.sendStatus(200); // answer Meta at once; work happens after

  if (!cfg.enabled) return;
  const messages = wa.parseWebhook(req.body);
  for (const m of messages) {
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

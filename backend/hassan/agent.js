// Hassan's decision loop: one inbound WhatsApp message in, at most one reply out.
const { detectIntent, checkReply, checkMedicalReply, checkFixedPriceReply, serviceWindowOpen, adWindowOpen, HOUR } = require('./rules');
const { slotsToOffer, freeSlots, parseSlotId, label } = require('./slots');
const { pkr } = require('./playbook');

const MIN = 60 * 1000;
const monthKey = (d) => d.toISOString().slice(0, 7);
const firstName = (lead) => (lead.name || lead.fullName || lead.profileName || '').split(/\s+/)[0] || '';

const HOLDING = {
  faraz: 'Of course. Let me get Faraz to message you personally on this.',
  error: 'Thanks for your message! Someone from the team will reply to you shortly.'
};
const BOT_REPLY = "Yes, I'm Hassan, Peak Performance's AI assistant. Happy to help you, or Faraz can message you himself. Which would you prefer?";
const NON_TEXT_REPLY = 'Sorry, I can only read typed messages here. Could you type your question for me?';

// Used when the lead pushes back on price and the AI can't produce a safe reply.
const fixedPriceReply = (service, price, slots) =>
  `I understand. Our prices are fixed and the same for everyone: the ${service} is ${price}. ` +
  (slots.length >= 2 ? `I have ${slots[0].label} or ${slots[1].label}. Which suits you?` : 'Shall I find you a time this week?');

// Used when the lead mentions pain or injury and the AI can't produce a safe reply.
const physioReferral = (price, slots) =>
  `Thanks for telling me, I've noted this. The right next step is a visit to our physiotherapist so they can assess it properly. ` +
  `A physio session is ${price}. ` +
  (slots.length >= 2 ? `I have ${slots[0].label} or ${slots[1].label}. Which suits you?` : 'Shall I find you a time this week?');

const createAgent = (deps) => {
  const { cfg, store, brain, wa } = deps;
  const now = deps.now || (() => new Date());
  const alert = deps.alert || (async () => {});
  const log = deps.log || console;

  // Messages from the same person are handled one at a time; bookings globally.
  const queues = new Map();
  const serial = (key, fn) => {
    const prev = queues.get(key) || Promise.resolve();
    const next = prev.catch(() => {}).then(fn);
    const tail = next.catch(() => {});
    queues.set(key, tail);
    tail.then(() => { if (queues.get(key) === tail) queues.delete(key); });
    return next;
  };

  // ── sending (with the free-mode budget) ──────────────────────────────────
  const record = (lead, by, text, extra = {}) => {
    lead.messages = lead.messages || [];
    lead.messages.push({ by, text, at: now(), ...extra });
  };

  // Returns true if sent. Free-form text only works inside the 24h window.
  const sendText = async (lead, text, by = 'hassan') => {
    const t = now();
    if (!serviceWindowOpen(lead, t.getTime())) {
      record(lead, 'system', `Not sent (24-hour window closed): ${text}`, { kind: 'note', failed: true });
      return false;
    }
    const freeByAd = adWindowOpen(lead, t.getTime(), cfg);
    if (!freeByAd) {
      const stat = await store.getStat(monthKey(t));
      if (cfg.freeMode && stat.serviceSent >= cfg.freeServiceMessagesPerMonth) {
        record(lead, 'system', `Not sent (free monthly limit reached): ${text}`, { kind: 'note', failed: true });
        if (!stat.limitAlerted) {
          await store.setStat(monthKey(t), { limitAlerted: true });
          await alert('Hassan hit the free message limit', `Hassan has used this month's ${cfg.freeServiceMessagesPerMonth} free replies to non-ad leads, so he has stopped replying to them until next month. Reply from the Inbox, or turn off free mode (HASSAN_FREE_MODE=false).`);
        }
        return false;
      }
    }
    try {
      const waId = await wa.sendText(cfg, lead.phone, text);
      log.log?.(`[hassan] replied to ...${String(lead.phone).slice(-4)}`);
      record(lead, by, text, { waId });
      lead.lastOutboundAt = now();
      if (!freeByAd) {
        const s = await store.bumpStat(monthKey(t), 'serviceSent');
        if (s.serviceSent >= cfg.serviceWarnAt && !s.warned) {
          await store.setStat(monthKey(t), { warned: true });
          await alert('Hassan is near the free message limit', `${s.serviceSent} of ${cfg.freeServiceMessagesPerMonth} free replies used this month (ad leads don't count).`);
        }
      }
      return true;
    } catch (e) {
      log.error('[hassan] send failed:', e.response?.data?.error?.message || e.message);
      record(lead, 'system', `Send failed: ${text}`, { kind: 'note', failed: true });
      return false;
    }
  };

  const sendTemplate = async (lead, name, params, note) => {
    const t = now().getTime();
    if (!name) return false;
    if (cfg.freeMode && !adWindowOpen(lead, t, cfg)) return false; // would cost money
    try {
      const waId = await wa.sendTemplate(cfg, lead.phone, name, params);
      record(lead, 'hassan', note, { waId, kind: 'template' });
      lead.lastOutboundAt = now();
      await store.bumpStat(monthKey(now()), 'templatesSent');
      return true;
    } catch (e) {
      log.error('[hassan] template failed:', e.response?.data?.error?.message || e.message);
      record(lead, 'system', `Template failed: ${note}`, { kind: 'note', failed: true });
      return false;
    }
  };

  const handOff = async (lead, to, reason, holding) => {
    lead.paused = true;
    lead.stage = 'handoff';
    lead.handoffTo = to;
    lead.handoffReason = reason;
    await sendText(lead, holding || HOLDING[to] || HOLDING.faraz);
    lead.lastAlertAt = now();
    const who = 'Faraz';
    const last = [...lead.messages].reverse().find(m => m.by === 'lead');
    await alert(`Hassan handed a chat to ${who}: ${lead.name || lead.profileName || lead.phone}`,
      `${reason}\n\nLead: ${lead.fullName || lead.name || lead.profileName || ''} (+${lead.phone})\nLast message: "${last ? last.text : ''}"\n\nHassan is paused on this chat. Reply from the Inbox in the PP dashboard.`);
  };

  // ── booking ──────────────────────────────────────────────────────────────
  const bookingLock = { key: '__bookings__' };
  const calendar = deps.calendar || null;

  // Times blocked in Google Calendar. If the calendar can't be reached, carry on
  // without it rather than stop booking.
  const calendarBusy = async (from, to) => {
    if (!calendar) return [];
    try { return await calendar.busyBetween(from, to); }
    catch (e) { log.error('[hassan] calendar read failed:', e.response?.data?.error?.message || e.message); return []; }
  };

  const tryBook = (lead, decision) => serial(bookingLock.key, async () => {
    const t = now();
    const serviceKey = decision.service || lead.service || 'assessment';
    const service = cfg.services[serviceKey];
    if (!service || !service.bookable) return { ok: false, reason: 'not_bookable', serviceKey };

    const parsed = parseSlotId(decision.book.slotId);
    const horizon = new Date(t.getTime() + (cfg.bookingDaysAhead + 1) * 24 * HOUR);
    const bookings = await store.bookingsBetween(t, horizon);
    const free = freeSlots(cfg, t, bookings, await calendarBusy(t, horizon));
    const slot = parsed && free.find(s => s.id === decision.book.slotId);
    if (!slot) return { ok: false, reason: 'slot_gone', free };

    let booking = await store.createBooking({
      lead: lead._id, phone: lead.phone, fullName: decision.book.fullName,
      service: serviceKey, price: service.price, slotId: slot.id,
      locationId: slot.locationId, location: slot.location, start: slot.start, status: 'booked'
    });
    if (calendar) {
      try {
        const calendarEventId = await calendar.createEvent({ ...booking, serviceLabel: service.label }, cfg.slotMinutes);
        booking = await store.saveBooking({ ...booking, calendarEventId });
      } catch (e) {
        const why = e.response?.data?.error?.message || e.message;
        log.error('[hassan] calendar event failed:', why);
        await alert(`Add to calendar by hand: ${booking.fullName}, ${slot.label}`, `Hassan booked this slot but couldn't add it to Google Calendar (${why}).`);
      }
    }
    return { ok: true, booking, slot, service, serviceKey };
  });

  const confirmation = (name, slot, service) =>
    `You're booked, ${name}! ${service.label} on ${slot.label} at ${slot.location}. ` +
    `${pkr(service.price)}. ${cfg.paymentNote} Please wear sportswear and trainers. ` +
    `Reply here if anything changes. See you then!`;

  // ── inbound ──────────────────────────────────────────────────────────────
  // 1) Save every incoming message straight away.
  const storeInbound = (msg) => serial(msg.from, async () => {
    let lead = await store.getLead(msg.from);
    if (!lead) lead = { phone: msg.from, stage: 'new', messages: [], followUpsSent: [], paused: false };
    if (lead.messages.some(m => m.waId && m.waId === msg.id)) return { skipped: 'duplicate' };

    const at = msg.at || now();
    if (msg.profileName) lead.profileName = msg.profileName;
    if (!lead.firstInboundAt) lead.firstInboundAt = at;
    lead.lastInboundAt = at;
    lead.followUpsSent = [];
    if (msg.fromAd && !lead.fromAd) {
      lead.fromAd = true;
      lead.adEntryAt = at;
      lead.adHeadline = msg.adHeadline;
    }
    record(lead, 'lead', msg.text ?? `[${msg.type} message]`, { waId: msg.id, kind: msg.type || 'text' });
    if (wa.markRead) Promise.resolve().then(() => wa.markRead(cfg, msg.id)).catch(() => {});
    return { lead: await store.saveLead(lead), stored: true };
  });

  // 2) Wait a few seconds so quick back-to-back messages get one reply.
  const timers = new Map();
  const handleInbound = async (msg) => {
    const s = await storeInbound(msg);
    if (s.skipped) return s;
    if (!cfg.replyDelayMs) return respond(msg.from);
    clearTimeout(timers.get(msg.from));
    timers.set(msg.from, setTimeout(() => {
      timers.delete(msg.from);
      respond(msg.from).catch(e => log.error('[hassan] reply failed:', e.message));
    }, cfg.replyDelayMs));
    return { action: 'queued' };
  };

  const TEXT_KINDS = new Set(['text', 'button', 'interactive']);

  // 3) Answer everything the lead said since our last message.
  const respond = (phone) => serial(phone, async () => {
    const lead = await store.getLead(phone);
    if (!lead) return { skipped: 'no_lead' };
    const pending = [];
    for (let i = lead.messages.length - 1; i >= 0; i--) {
      const m = lead.messages[i];
      if (m.by === 'lead') pending.unshift(m);
      else if (m.by === 'system') continue;
      else break;
    }
    if (!pending.length) return { skipped: 'already_answered' };
    const texts = pending.filter(m => TEXT_KINDS.has(m.kind || 'text')).map(m => m.text);
    const text = texts.length ? texts.join('\n') : null;

    // A person is handling this chat: stay quiet, nudge them.
    if (lead.paused) {
      log.log?.(`[hassan] paused on ...${String(lead.phone).slice(-4)}, not replying (turn him back on from the inbox)`);
      if (!lead.lastAlertAt || now() - new Date(lead.lastAlertAt) > 30 * MIN) {
        lead.lastAlertAt = now();
        await alert(`New message from ${lead.name || lead.profileName || lead.phone} (Hassan paused)`, `"${pending.map(m => m.text).join(' / ')}"\n\nReply from the Inbox in the PP dashboard.`);
      }
      return { lead: await store.saveLead(lead), action: 'paused' };
    }

    if (text === null) {
      await sendText(lead, NON_TEXT_REPLY);
      return { lead: await store.saveLead(lead), action: 'non_text' };
    }

    const intent = detectIntent(text);
    if (intent.handoff) {
      await handOff(lead, intent.handoff, intent.reason);
      return { lead: await store.saveLead(lead), action: 'handoff' };
    }
    if (intent.botCheck) {
      await sendText(lead, BOT_REPLY);
      return { lead: await store.saveLead(lead), action: 'bot_check' };
    }

    // Pain or injury: noted, and we steer them to a physio assessment (no handoff).
    const medical = !!intent.medical;
    const priceFixed = !!intent.pricePushback;
    if (priceFixed) record(lead, 'system', 'Pushed back on price: Hassan told them prices are fixed', { kind: 'note' });
    if (medical) {
      lead.mentionedPain = true;
      lead.service = 'physio';
      record(lead, 'system', 'Mentioned pain or injury: Hassan is steering them to a physio assessment', { kind: 'note' });
    }

    // Ask the AI, then check its answer against the hard rules.
    const t = now();
    const horizon = new Date(t.getTime() + (cfg.bookingDaysAhead + 1) * 24 * HOUR);
    const slots = slotsToOffer(cfg, t, await store.bookingsBetween(t, horizon), await calendarBusy(t, horizon));
    const problemsWith = (d) => {
      if (d.book || d.handoff) return [];
      return [...checkReply(d.reply, cfg), ...(medical ? checkMedicalReply(d.reply) : []), ...(priceFixed ? checkFixedPriceReply(d.reply) : [])];
    };
    const fallback = (why) => (medical ? physioFallback(why) : priceFixed ? priceFallback(why) : null);
    const priceFallback = async (why) => {
      const key = cfg.services[lead.service] ? lead.service : 'assessment';
      const svc = cfg.services[key];
      lead.stage = 'slot_offered';
      await sendText(lead, fixedPriceReply(svc.label, pkr(svc.price), slots));
      log.error(`[hassan] used the standard fixed-price reply (${why})`);
      return { lead: await store.saveLead(lead), action: 'fixed_price' };
    };
    const physioFallback = async (why) => {
      lead.stage = 'slot_offered';
      await sendText(lead, physioReferral(pkr(cfg.services.physio.price), slots));
      log.error(`[hassan] used the standard physio reply (${why})`);
      return { lead: await store.saveLead(lead), action: 'physio_referral' };
    };
    let decision;
    try {
      decision = await brain.think(cfg, { lead, messages: lead.messages, slots, now: t, medical, priceFixed });
      let problems = problemsWith(decision);
      if (problems.length) {
        decision = await brain.think(cfg, { lead, messages: lead.messages, slots, now: t, medical, priceFixed, feedback: problems.join('; ') });
        problems = problemsWith(decision);
        if (problems.length) {
          if (medical || priceFixed) return fallback(problems.join('; '));
          await handOff(lead, 'faraz', `Hassan's reply failed the safety check (${problems.join('; ')})`, HOLDING.error);
          return { lead: await store.saveLead(lead), action: 'unsafe_reply' };
        }
      }
    } catch (e) {
      log.error('[hassan] AI failed:', e.message);
      if (medical || priceFixed) return fallback(`AI error: ${e.message}`);
      await handOff(lead, 'faraz', `Hassan couldn't think of a reply (AI error: ${e.message})`, HOLDING.error);
      return { lead: await store.saveLead(lead), action: 'ai_error' };
    }
    if (medical && !decision.book && !decision.handoff) decision.service = 'physio';

    if (decision.leadName && !lead.name) lead.name = decision.leadName;
    if (decision.service && cfg.services[decision.service]) lead.service = decision.service;

    if (decision.handoff) {
      const holding = decision.reply && !checkReply(decision.reply, cfg).length ? decision.reply : undefined;
      await handOff(lead, decision.handoff, decision.handoffReason || 'Hassan asked for help', holding);
      return { lead: await store.saveLead(lead), action: 'handoff' };
    }

    if (decision.book) {
      if (!decision.book.fullName) {
        lead.stage = 'slot_offered';
        await sendText(lead, 'Great choice! What full name should I put the booking under?');
        return { lead: await store.saveLead(lead), action: 'ask_name' };
      }
      const r = await tryBook(lead, decision);
      if (r.ok) {
        lead.stage = 'booked';
        lead.fullName = decision.book.fullName;
        lead.service = r.serviceKey;
        if (!lead.name) lead.name = decision.book.fullName.split(/\s+/)[0];
        await sendText(lead, confirmation(firstName(lead), r.slot, r.service));
        await alert(`New booking: ${lead.fullName}, ${r.slot.label}`,
          `${r.service.label} (${pkr(r.service.price)})\n${r.slot.label} at ${r.slot.location}\nPhone: +${lead.phone}\nBooked by Hassan.`);
        return { lead: await store.saveLead(lead), action: 'booked', booking: r.booking };
      }
      if (r.reason === 'not_bookable') {
        await handOff(lead, 'faraz', 'Wants a home visit: Faraz to arrange the time', 'Perfect. Faraz will message you personally to arrange the home visit.');
        return { lead: await store.saveLead(lead), action: 'handoff' };
      }
      const two = (r.free || []).slice(0, 2);
      lead.stage = 'slot_offered';
      await sendText(lead, two.length === 2
        ? `Sorry, that slot just got taken. I can do ${two[0].label} or ${two[1].label}. Which suits you?`
        : 'Sorry, that slot just got taken. Let me get Faraz to find you a time.');
      return { lead: await store.saveLead(lead), action: 'slot_gone' };
    }

    if (decision.stage) lead.stage = decision.stage;
    await sendText(lead, decision.reply);
    return { lead: await store.saveLead(lead), action: 'replied' };
  });

  // ── follow-ups and reminders (run every few minutes) ─────────────────────
  const FOLLOW_UPS = [
    { key: 'same_day', afterHours: 2, from: 'outbound', freeForm: true,
      text: (n, lead) => lead.mentionedPain
        ? `Hi ${n || 'there'}, I can still hold a slot with our physio this week so it can be assessed. Want me to lock one in?`
        : `Hi ${n || 'there'}, I can still hold an evening slot for you this week. Want me to lock one in?` },
    { key: 'day1', afterHours: 22, from: 'inbound', freeForm: true,
      text: (n, lead) => lead.mentionedPain
        ? `Quick one${n ? `, ${n}` : ''}: shall I book you in with our physiotherapist this week, so it gets assessed properly?`
        : `Quick one${n ? `, ${n}` : ''}: most people who come in are surprised by their left-right difference. Want to find yours this week?` },
    { key: 'day3', afterHours: 72, from: 'inbound', template: 'day3',
      note: 'Day 3 follow-up (template)' },
    { key: 'day7', afterHours: 156, from: 'inbound', template: 'day7',
      note: 'Day 7 follow-up (template)' }
  ];

  const followUpLead = (phone) => serial(phone, async () => {
    const lead = await store.getLead(phone);
    if (!lead || lead.paused || !['new', 'qualified', 'slot_offered'].includes(lead.stage)) return null;
    if (!lead.lastOutboundAt || !lead.lastInboundAt) return null;
    if (new Date(lead.lastOutboundAt) < new Date(lead.lastInboundAt)) return null; // we owe them a reply
    const t = now().getTime();
    const sent = new Set(lead.followUpsSent || []);

    for (const f of FOLLOW_UPS) {
      if (sent.has(f.key)) continue;
      const base = new Date(f.from === 'outbound' ? lead.lastOutboundAt : lead.lastInboundAt).getTime();
      if (t < base + f.afterHours * HOUR) return null; // not due yet; later ones aren't either
      let ok;
      if (f.freeForm) {
        if (!serviceWindowOpen(lead, t)) { lead.followUpsSent = [...sent, f.key]; continue; } // missed: skip
        ok = await sendText(lead, f.text(firstName(lead), lead));
      } else {
        ok = await sendTemplate(lead, cfg.whatsapp.templates[f.template], [firstName(lead) || 'there'], f.note);
      }
      lead.followUpsSent = [...sent, f.key]; // mark even if skipped, so it never repeats
      await store.saveLead(lead);
      return ok ? f.key : null;
    }
    return null;
  });

  const remindBooking = async (b) => {
    const lead = await store.getLead(b.phone);
    if (!lead) return null;
    const t = now().getTime();
    const start = new Date(b.start).getTime();
    const due = [
      { key: 'day_before', from: start - 26 * HOUR, to: start - 6 * HOUR },
      { key: 'two_hours', from: start - 2.5 * HOUR, to: start - 0.5 * HOUR }
    ].find(r => t >= r.from && t < r.to && !(b.remindersSent || []).includes(r.key));
    if (!due) return null;
    // Booked recently? They've just had the confirmation, so no reminder yet.
    const bookedAgo = b.createdAt ? t - new Date(b.createdAt).getTime() : Infinity;
    if (bookedAgo < (due.key === 'day_before' ? 12 : 3) * HOUR) return null;

    const service = cfg.services[b.service] || { label: 'session' };
    const n = firstName(lead);
    const when = label(new Date(b.start));
    let ok = false;
    if (serviceWindowOpen(lead, t)) {
      ok = await sendText(lead, `Hi ${n || 'there'}, see you ${when} at ${b.location} for your ${service.label}. Please wear sportswear and trainers. Reply here if anything changes.`);
    } else {
      ok = await sendTemplate(lead, cfg.whatsapp.templates.reminder, [n || 'there', when], `Reminder for ${when} (template)`);
    }
    b.remindersSent = [...(b.remindersSent || []), due.key]; // never retry
    await store.saveBooking(b);
    await store.saveLead(lead);
    return ok ? due.key : null;
  };

  const runScheduled = async () => {
    const results = { followUps: 0, reminders: 0 };
    for (const lead of await store.leadsAwaitingFollowUp()) {
      try { if (await followUpLead(lead.phone)) results.followUps++; } catch (e) { log.error('[hassan] follow-up failed:', e.message); }
    }
    const t = now();
    const upcoming = await store.bookingsBetween(t, new Date(t.getTime() + 27 * HOUR));
    for (const b of upcoming.filter(x => x.status === 'booked')) {
      try { if (await serial(b.phone, () => remindBooking(b))) results.reminders++; } catch (e) { log.error('[hassan] reminder failed:', e.message); }
    }
    return results;
  };

  // ── team actions from the Inbox ──────────────────────────────────────────
  const staffReply = (phone, text) => serial(phone, async () => {
    const lead = await store.getLead(phone);
    if (!lead) throw Object.assign(new Error('Lead not found'), { statusCode: 404 });
    if (!serviceWindowOpen(lead, now().getTime())) {
      throw Object.assign(new Error('WhatsApp only lets you reply within 24 hours of their last message. Wait for them to message again.'), { statusCode: 409 });
    }
    const ok = await sendText(lead, text, 'staff');
    const saved = await store.saveLead(lead);
    if (!ok) throw Object.assign(new Error('WhatsApp did not accept the message. Check the chat for details.'), { statusCode: 502 });
    return saved;
  });

  // Team starts a new chat: WhatsApp only allows an approved template for this.
  const staffStart = (phoneIn, name) => {
    const phone = normalizePhone(phoneIn);
    if (!phone) return Promise.reject(Object.assign(new Error('Enter a valid number, e.g. 0300 1234567 or +92 300 1234567.'), { statusCode: 400 }));
    return serial(phone, async () => {
      let lead = await store.getLead(phone);
      if (lead && serviceWindowOpen(lead, now().getTime())) {
        throw Object.assign(new Error('This person messaged in the last 24 hours. Open their chat and reply there instead.'), { statusCode: 409 });
      }
      if (!lead) lead = { phone, stage: 'new', messages: [], followUpsSent: [], paused: false };
      const first = String(name || '').trim().split(/\s+/)[0] || 'there';
      if (name && !lead.name) lead.name = String(name).trim();
      const tpl = cfg.whatsapp.templates.open;
      if (!tpl) throw Object.assign(new Error('No opening template is set up yet.'), { statusCode: 400 });
      const text = String(cfg.whatsapp.openText || '').replace('{{1}}', first);
      try {
        const waId = await wa.sendTemplate(cfg, phone, tpl, [first]);
        record(lead, 'staff', text, { waId, kind: 'template' });
        lead.lastOutboundAt = now();
        await store.bumpStat(monthKey(now()), 'templatesSent');
      } catch (e) {
        const why = e.response?.data?.error?.message || e.message;
        log.error('[hassan] opening template failed:', why);
        throw Object.assign(new Error(`WhatsApp did not send it: ${why}`), { statusCode: 502 });
      }
      return store.saveLead(lead);
    });
  };

  const setPaused = (phone, paused) => serial(phone, async () => {
    const lead = await store.getLead(phone);
    if (!lead) throw Object.assign(new Error('Lead not found'), { statusCode: 404 });
    lead.paused = !!paused;
    if (!paused && lead.stage === 'handoff') lead.stage = lead.fullName ? 'booked' : 'qualified';
    record(lead, 'system', paused ? 'Hassan paused by the team' : 'Hassan switched back on', { kind: 'note' });
    return store.saveLead(lead);
  });

  return { handleInbound, respond, runScheduled, staffReply, staffStart, setPaused, followUpLead };
};

// 0300 1234567 / +92 300 1234567 / 923001234567 -> 923001234567
const normalizePhone = (raw) => {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = '92' + d.slice(1);
  else if (d.length === 10 && d.startsWith('3')) d = '92' + d;
  return d.length >= 10 && d.length <= 15 ? d : null;
};

module.exports = { createAgent, normalizePhone, HOLDING, BOT_REPLY, NON_TEXT_REPLY, physioReferral, fixedPriceReply };

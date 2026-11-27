// WhatsApp Cloud API (direct to Meta, no provider): send messages, read webhooks.
const axios = require('axios');
const crypto = require('crypto');

const api = (cfg) => axios.create({
  baseURL: `https://graph.facebook.com/${cfg.whatsapp.apiVersion}/${cfg.whatsapp.phoneNumberId}`,
  headers: { Authorization: `Bearer ${cfg.whatsapp.token}`, 'Content-Type': 'application/json' },
  timeout: 20000
});

const sendText = async (cfg, to, body) => {
  const res = await api(cfg).post('/messages', {
    messaging_product: 'whatsapp', recipient_type: 'individual', to,
    type: 'text', text: { preview_url: false, body }
  });
  return res.data?.messages?.[0]?.id || null;
};

// params: list of strings for the template body's {{1}}, {{2}} …
const sendTemplate = async (cfg, to, name, params = []) => {
  const res = await api(cfg).post('/messages', {
    messaging_product: 'whatsapp', to, type: 'template',
    template: {
      name,
      language: { code: cfg.whatsapp.templateLanguage },
      components: params.length ? [{ type: 'body', parameters: params.map(text => ({ type: 'text', text: String(text) })) }] : []
    }
  });
  return res.data?.messages?.[0]?.id || null;
};

const markRead = async (cfg, messageId) => {
  try {
    await api(cfg).post('/messages', { messaging_product: 'whatsapp', status: 'read', message_id: messageId });
  } catch (_) { /* not important */ }
};

// Meta signs every webhook with the app secret. Reject anything unsigned.
const validSignature = (cfg, rawBody, header) => {
  if (!cfg.whatsapp.appSecret) return false;
  if (!rawBody || !header || !header.startsWith('sha256=')) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', cfg.whatsapp.appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// Flattens Meta's webhook payload into simple inbound messages.
const parseWebhook = (body) => {
  const out = [];
  for (const entry of body?.entry || []) {
    for (const change of entry.changes || []) {
      const v = change.value || {};
      const names = new Map((v.contacts || []).map(c => [c.wa_id, c.profile?.name]));
      for (const m of v.messages || []) {
        let text = null;
        if (m.type === 'text') text = m.text?.body || '';
        else if (m.type === 'button') text = m.button?.text || '';
        else if (m.type === 'interactive') text = m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || '';
        out.push({
          id: m.id,
          from: m.from,
          to: v.metadata?.phone_number_id || null, // which of our numbers it was sent to
          profileName: names.get(m.from) || null,
          at: new Date(Number(m.timestamp) * 1000),
          type: m.type,
          text,
          // Present when the chat started from a Click-to-WhatsApp ad.
          fromAd: !!(m.referral && (m.referral.source_type === 'ad' || m.referral.ctwa_clid)),
          adHeadline: m.referral?.headline || null
        });
      }
    }
  }
  return out;
};

module.exports = { sendText, sendTemplate, markRead, validSignature, parseWebhook };

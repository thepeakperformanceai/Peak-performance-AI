// Asks Gemini for Hassan's next reply. Returns the parsed JSON decision.
const axios = require('axios');
const { buildSystemPrompt } = require('./playbook');
const { label } = require('./slots');

const HISTORY_LIMIT = 20;

const buildUserPrompt = ({ lead, messages, slots, now, feedback, medical, priceFixed }) => {
  const history = messages.slice(-HISTORY_LIMIT).map(m => {
    const who = m.by === 'lead' ? 'LEAD' : m.by === 'staff' ? 'TEAM (Faraz)' : 'HASSAN';
    return `${who}: ${m.text}`;
  }).join('\n');

  // One line per evening: "Fri 27 Nov (Peak Performance Lab…): 6pm [id] · 6:30pm [id] …"
  const byDay = new Map();
  for (const s of slots) {
    const [day, time] = s.label.split(', ');
    const key = `${day} (${s.location})`;
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(`${time} [${s.id}]`);
  }
  const slotLines = byDay.size
    ? [...byDay].map(([day, times]) => `- ${day}: ${times.join(' · ')}`).join('\n')
    : '- none free this week: say a team member will confirm a time, and hand off to "faraz"';

  return [
    `NOW (Karachi): ${label(now)}`,
    `LEAD: name=${lead.name || 'unknown'}, stage=${lead.stage}, service=${lead.service || 'unknown'}, came from ${lead.fromAd ? 'a Meta ad' : 'a direct message'}`,
    '',
    'AVAILABLE SLOTS (every free 30-minute slot for the next week; book using the id in [brackets]):',
    slotLines,
    '',
    'CONVERSATION SO FAR:',
    history,
    '',
    medical ? 'IMPORTANT: their last message mentions pain or an injury. Say you have noted it and that they need to visit our physiotherapist so it can be assessed properly. Give the physio session price, offer two slots, set service to "physio". No advice, no diagnosis, no questions about symptoms.\n' : '',
    priceFixed ? 'IMPORTANT: they are pushing back on price. Politely say our prices are fixed and the same for everyone, remind them in one line what they get, then offer two slots. Do not use the word "discount" and never lower the price.\n' : '',
    feedback ? `YOUR LAST DRAFT BROKE THESE RULES, fix them: ${feedback}\n` : '',
    'Write Hassan\'s next message as the JSON object.'
  ].join('\n');
};

const parseDecision = (text) => {
  const cleaned = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const d = JSON.parse(cleaned);
  return {
    reply: typeof d.reply === 'string' ? d.reply.trim() : '',
    stage: ['new', 'qualified', 'slot_offered'].includes(d.stage) ? d.stage : null,
    leadName: typeof d.lead_name === 'string' && d.lead_name.trim() ? d.lead_name.trim() : null,
    service: typeof d.service === 'string' ? d.service : null,
    book: d.book && typeof d.book === 'object' && d.book.slot_id ? { slotId: String(d.book.slot_id), fullName: String(d.book.full_name || '').trim() } : null,
    handoff: d.handoff === 'faraz' ? 'faraz' : null,
    handoffReason: typeof d.handoff_reason === 'string' ? d.handoff_reason : null
  };
};

const callModel = async (cfg, model, input) => {
  try {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        systemInstruction: { parts: [{ text: buildSystemPrompt(cfg) }] },
        contents: [{ role: 'user', parts: [{ text: buildUserPrompt(input) }] }],
        generationConfig: {
          temperature: 0.4,
          responseMimeType: 'application/json',
          maxOutputTokens: 2048,
          // 2.5 Flash: skip "thinking" so replies are fast and use less free quota.
          ...(/2\.5-flash/i.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {})
        }
      },
      { headers: { 'x-goog-api-key': cfg.gemini.key, 'Content-Type': 'application/json' }, timeout: cfg.gemini.timeoutMs || 12000 }
    );
    const parts = res.data?.candidates?.[0]?.content?.parts || [];
    const text = parts.filter(p => !p.thought).map(p => p.text || '').join('');
    return parseDecision(text);
  } catch (e) {
    const g = e.response?.data?.error;
    const err = new Error(g ? `Gemini ${e.response.status} ${g.status || ''} (${model}): ${g.message}` : e.message);
    err.status = e.response?.status;
    throw err;
  }
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const BUSY = new Set([429, 500, 503, 504]);

const think = async (cfg, input, wait = sleep) => {
  if (!cfg.gemini.key) throw new Error('Hassan has no Gemini key (set HASSAN_GEMINI_API_KEY or GEMINI_API_KEY).');
  const delays = cfg.gemini.retryDelaysMs || [];
  let last;
  for (const model of cfg.gemini.models) {
    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        return await callModel(cfg, model, input);
      } catch (e) {
        last = e;
        const busy = BUSY.has(e.status) || /timeout|ECONNRESET|socket hang up/i.test(e.message);
        const dailyLimit = e.status === 429 && /per day|PerDay|free_tier/i.test(e.message);
        if (busy && !dailyLimit && attempt < delays.length) {
          console.warn(`[hassan] ${e.message}; retrying in ${delays[attempt] / 1000}s`);
          await wait(delays[attempt]);
          continue;
        }
        if (busy || e.status === 404) {
          console.warn(`[hassan] ${e.message}; trying the next model`);
          break; // next model
        }
        throw e; // a real problem (bad key, bad request): don't hide it
      }
    }
  }
  throw last;
};

module.exports = { think, buildUserPrompt, parseDecision };

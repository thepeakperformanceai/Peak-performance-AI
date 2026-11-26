// Asks Gemini for Hassan's next reply. Returns the parsed JSON decision.
const axios = require('axios');
const { buildSystemPrompt } = require('./playbook');
const { label } = require('./slots');

const HISTORY_LIMIT = 20;

const buildUserPrompt = ({ lead, messages, slots, now, feedback, medical }) => {
  const history = messages.slice(-HISTORY_LIMIT).map(m => {
    const who = m.by === 'lead' ? 'LEAD' : m.by === 'staff' ? 'TEAM (Faraz)' : 'HASSAN';
    return `${who}: ${m.text}`;
  }).join('\n');

  const slotLines = slots.length
    ? slots.map(s => `- id: ${s.id} | ${s.label} | ${s.location}`).join('\n')
    : '- none free this week: say a team member will confirm a time, and hand off to "faraz"';

  return [
    `NOW (Karachi): ${label(now)}`,
    `LEAD: name=${lead.name || 'unknown'}, stage=${lead.stage}, service=${lead.service || 'unknown'}, came from ${lead.fromAd ? 'a Meta ad' : 'a direct message'}`,
    '',
    'AVAILABLE SLOTS (offer exactly two; only these ids can be booked):',
    slotLines,
    '',
    'CONVERSATION SO FAR:',
    history,
    '',
    medical ? 'IMPORTANT: their last message mentions pain or an injury. Say you have noted it and that they need to visit our physiotherapist so it can be assessed properly. Give the physio session price, offer two slots, set service to "physio". No advice, no diagnosis, no questions about symptoms.\n' : '',
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

const think = async (cfg, input) => {
  if (!cfg.gemini.key) throw new Error('Hassan has no Gemini key (set HASSAN_GEMINI_API_KEY or GEMINI_API_KEY).');
  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${cfg.gemini.model}:generateContent`,
    {
      systemInstruction: { parts: [{ text: buildSystemPrompt(cfg) }] },
      contents: [{ role: 'user', parts: [{ text: buildUserPrompt(input) }] }],
      generationConfig: {
        temperature: 0.4,
        responseMimeType: 'application/json',
        maxOutputTokens: 1024,
        // Flash models: skip "thinking" so replies are fast and use less free quota.
        ...(/flash/i.test(cfg.gemini.model) ? { thinkingConfig: { thinkingBudget: 0 } } : {})
      }
    },
    { headers: { 'x-goog-api-key': cfg.gemini.key, 'Content-Type': 'application/json' }, timeout: 30000 }
  );
  const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return parseDecision(text);
};

module.exports = { think, buildUserPrompt, parseDecision };

// Hard rules that do NOT depend on the AI. They run before and after Gemini,
// so a bad or creative AI reply can never reach a client.

const HOUR = 60 * 60 * 1000;

// ── Inbound checks (run before the AI) ───────────────────────────────────────

// Medical: Hassan notes it and steers them to a physio assessment. English + Roman Urdu.
const MEDICAL = /\b(pain|painful|hurts?|hurting|surgery|surgeries|operation|fracture[ds]?|sprain(ed)?|torn|tear in|dislocat\w*|medication|medicines?|painkillers?|dard|chot|takleef|sujan|swelling|swollen)\b/i;

// Price pushback: Hassan says the price is fixed (no handoff).
const PRICE = /\b(discount|cheaper|kam kar\w*|kam ho\w*|kam hoga|sasta|mehe?nga|mahanga|expensive|too much|zyada hai|deal|package|best price|last price|final price|concession|rate kam)\b/i;

// Partnerships, wanting a person, unhappy: always goes to Faraz.
const FARAZ = /\b(partnership|collab\w*|sponsor\w*|refund|complain\w*|complaint|scam|fraud|talk to (a |someone|somebody|faraz|the owner|manager)|call me|phone kar\w*|manager|owner)\b/i;

// "Am I talking to a bot?" — answered honestly, without a handoff.
const BOT_CHECK = /\b(are you (a )?(bot|robot|real|human|ai)|is this (a )?(bot|robot|real person|human|ai)|bot ho|real (person|insaan)|insaan ho|machine ho|automated)\b/i;

const detectIntent = (text = '') => {
  if (FARAZ.test(text)) return { handoff: 'faraz', reason: 'Partnership, complaint or asked for a person' };
  const out = {};
  if (PRICE.test(text)) out.pricePushback = true;
  if (MEDICAL.test(text)) out.medical = true;
  if (!out.pricePushback && !out.medical && BOT_CHECK.test(text)) out.botCheck = true;
  return out;
};

// ── Outbound checks (run on every AI reply) ──────────────────────────────────

const BANNED = [
  { re: /\b(vald|humantrak|human trak|dynamo|forcedecks|force decks|nordbord)\b/i, why: 'named an equipment brand' },
  { re: /\b(discount|% ?off|promo|coupon|guarantee\w*|money.?back)\b/i, why: 'offered a discount or guarantee' },
  { re: /\b(diagnos\w*|you (probably |likely )?have (a |an )?(tear|sprain|injury|condition))\b/i, why: 'gave a diagnosis' },
  { re: /\brebuild\b/i, why: 'sold the Rebuild plan' },
  { re: /\b(i am|i'm) (a )?(real )?(human|person|insaan)\b/i, why: 'claimed to be human' }
];

// Every money amount in a reply must be one of our list prices.
const MONEY = /(?:pkr|rs\.?|rupees?)\s*([\d,]{3,})|([\d,]{3,})\s*(?:pkr|rs\b|rupees?)|\b(\d{1,3}(?:,\d{3})+)\b/gi;

const amountsIn = (text) => {
  const out = [];
  let m;
  MONEY.lastIndex = 0;
  while ((m = MONEY.exec(text)) !== null) {
    const raw = (m[1] || m[2] || m[3] || '').replace(/,/g, '');
    if (raw) out.push(Number(raw));
  }
  return out;
};

const checkReply = (reply, cfg) => {
  const problems = [];
  if (typeof reply !== 'string' || !reply.trim()) return ['empty reply'];
  if (reply.length > 700) problems.push('reply too long');
  for (const b of BANNED) if (b.re.test(reply)) problems.push(b.why);

  const allowed = new Set(Object.values(cfg.services).map(s => Number(s.price)));
  for (const a of amountsIn(reply)) {
    if (!allowed.has(a)) problems.push(`quoted a price that isn't on the list (${a})`);
  }

  if (/\bonline\b/i.test(reply) && !/\b(not|no|nahi|nahin|in[- ]person)\b/i.test(reply)) {
    problems.push('suggested the assessment is online');
  }
  return problems;
};

// Extra check when the lead mentioned pain or injury: the reply must send them
// to our physio and must not give any treatment advice.
const ADVICE = /\b(ice it|ice pack|apply ice|heat pack|rest it|stretch(es|ing)?|painkillers?|ibuprofen|panadol|brufen|paracetamol|massage it|you should (do|try|avoid)|try (doing|some)|it('s| is) (probably|likely|just))\b/i;
const checkMedicalReply = (reply) => {
  const problems = [];
  if (!/\b(physio|physiotherapist|physical therapist|physiotherapy)\b/i.test(reply || '')) problems.push('did not send them to our physio for an assessment');
  if (ADVICE.test(reply || '')) problems.push('gave treatment advice');
  return problems;
};

// Price pushback: the reply must say the price is fixed (and never discount).
const checkFixedPriceReply = (reply) =>
  /\b(fix|fixed|same (price )?for everyone|standard price)\b/i.test(reply || '') ? [] : ['did not say the price is fixed'];

// ── WhatsApp windows (what is free to send) ──────────────────────────────────

// 24h customer-service window: free-form messages allowed.
const serviceWindowOpen = (lead, now) =>
  !!lead.lastInboundAt && now - new Date(lead.lastInboundAt).getTime() < 24 * HOUR;

// Click-to-WhatsApp ad free entry-point window: all messages free.
const adWindowOpen = (lead, now, cfg) =>
  !!lead.fromAd && !!lead.adEntryAt &&
  now - new Date(lead.adEntryAt).getTime() < cfg.adFreeWindowHours * HOUR;

module.exports = { detectIntent, checkReply, checkMedicalReply, checkFixedPriceReply, amountsIn, serviceWindowOpen, adWindowOpen, HOUR };

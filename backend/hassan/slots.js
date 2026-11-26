// Booking slots, in Karachi time (UTC+5, no daylight saving).

const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// A Date's wall-clock parts in Karachi.
const pkt = (date) => {
  const d = new Date(date.getTime() + PKT_OFFSET_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), dow: d.getUTCDay(), h: d.getUTCHours(), min: d.getUTCMinutes() };
};

// Karachi wall-clock → real Date.
const fromPkt = (y, m, d, h, min) => new Date(Date.UTC(y, m, d, h, min) - PKT_OFFSET_MS);

const hm = (s) => s.split(':').map(Number);

const label = (date) => {
  const p = pkt(date);
  const h12 = ((p.h + 11) % 12) + 1;
  const mm = p.min ? `:${String(p.min).padStart(2, '0')}` : '';
  return `${DAYS[p.dow]} ${p.d} ${MONTHS[p.m]}, ${h12}${mm}${p.h < 12 ? 'am' : 'pm'}`;
};

const slotId = (locationId, date) => `${locationId}@${date.toISOString()}`;

const parseSlotId = (id) => {
  const at = String(id || '').indexOf('@');
  if (at < 1) return null;
  const start = new Date(id.slice(at + 1));
  if (isNaN(start)) return null;
  return { locationId: id.slice(0, at), start };
};

// All bookable slot starts in the window, ignoring existing bookings.
const allSlots = (cfg, now) => {
  const out = [];
  const earliest = now.getTime() + cfg.minHoursAhead * 60 * 60 * 1000;
  const today = pkt(now);
  for (let i = 0; i <= cfg.bookingDaysAhead; i++) {
    const day = new Date(fromPkt(today.y, today.m, today.d, 12, 0).getTime() + i * DAY_MS);
    const p = pkt(day);
    for (const loc of cfg.locations) {
      if (!loc.days.includes(p.dow)) continue;
      const [sh, sm] = hm(loc.start);
      const [eh, em] = hm(loc.end);
      let t = fromPkt(p.y, p.m, p.d, sh, sm).getTime();
      const end = fromPkt(p.y, p.m, p.d, eh, em).getTime();
      for (; t + cfg.slotMinutes * 60000 <= end; t += cfg.slotMinutes * 60000) {
        if (t < earliest) continue;
        const start = new Date(t);
        out.push({ id: slotId(loc.id, start), locationId: loc.id, location: loc.label, start, label: label(start) });
      }
    }
  }
  return out.sort((a, b) => a.start - b.start);
};

// Free slots, given bookings [{ slotId, status }].
const freeSlots = (cfg, now, bookings) => {
  const taken = new Map();
  for (const b of bookings) {
    if (b.status === 'cancelled') continue;
    taken.set(b.slotId, (taken.get(b.slotId) || 0) + 1);
  }
  return allSlots(cfg, now).filter(s => (taken.get(s.id) || 0) < cfg.clientsPerSlot);
};

// A short, spread-out list to show the AI: a few per evening, soonest first.
const slotsToOffer = (cfg, now, bookings) => {
  const free = freeSlots(cfg, now, bookings);
  const perDay = new Map();
  const picked = [];
  for (const s of free) {
    const key = `${s.locationId}:${pkt(s.start).d}`;
    const n = perDay.get(key) || 0;
    if (n >= 2) continue;
    perDay.set(key, n + 1);
    picked.push(s);
    if (picked.length >= cfg.slotsToOffer) break;
  }
  return picked;
};

module.exports = { allSlots, freeSlots, slotsToOffer, slotId, parseSlotId, label, pkt, fromPkt };

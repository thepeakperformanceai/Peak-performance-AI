// Hassan — the PeakPerformance WhatsApp sales agent.
// Every setting lives here and can be overridden with an environment variable,
// so changing prices, slots or limits never needs a code change.

const num = (v, d) => (v === undefined || v === '' || isNaN(Number(v)) ? d : Number(v));
const bool = (v, d) => (v === undefined || v === '' ? d : String(v).toLowerCase() === 'true');
const json = (v, d) => {
  if (!v) return d;
  try { return JSON.parse(v); } catch (e) {
    console.warn(`[hassan] could not parse JSON setting, using default: ${e.message}`);
    return d;
  }
};

// Services Hassan is allowed to sell, with their list prices (PKR).
// Hassan may only ever quote these numbers.
const DEFAULT_SERVICES = {
  assessment:       { label: 'Full Body Assessment',              price: 8000,  bookable: true  },
  physio:           { label: 'Physiotherapy session',             price: 3000,  bookable: true  },
  older_adult_lab:  { label: 'Balance & Movement Check (older adults)', price: 6000, bookable: true },
  older_adult_home: { label: 'Home visit for older adults',       price: 10000, bookable: false }
};

// Where and when Hassan can book. days: 0=Sun … 6=Sat. Times are Karachi time.
const DEFAULT_LOCATIONS = [
  { id: 'lab', label: 'Peak Performance Lab, Khayaban-e-Rahat', days: [0, 1, 2, 3, 4, 5, 6], start: '18:00', end: '22:00' },
  { id: 'k7',  label: 'K7, kickboxing gym',                     days: [3, 4],                start: '18:00', end: '22:00' }
];

const config = () => ({
  enabled: bool(process.env.HASSAN_ENABLED, false),

  // FREE MODE: Hassan only sends messages that cost nothing:
  //  - any reply while the 24h customer-service window is open (counts toward
  //    Meta's 1,000 free service messages a month, unless it's an ad lead),
  //  - follow-up templates only inside an ad lead's free entry-point window.
  freeMode: bool(process.env.HASSAN_FREE_MODE, true),
  freeServiceMessagesPerMonth: num(process.env.HASSAN_FREE_SERVICE_LIMIT, 1000),
  serviceWarnAt: num(process.env.HASSAN_SERVICE_WARN_AT, 900),
  // Click-to-WhatsApp ad free window, in hours (Meta: up to 7 days).
  adFreeWindowHours: num(process.env.HASSAN_AD_FREE_WINDOW_HOURS, 168),

  whatsapp: {
    token: process.env.WHATSAPP_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    appSecret: process.env.WHATSAPP_APP_SECRET,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v21.0',
    templateLanguage: process.env.HASSAN_TEMPLATE_LANGUAGE || 'en',
    templates: {
      day3: process.env.HASSAN_TPL_DAY3 || '',
      day7: process.env.HASSAN_TPL_DAY7 || '',
      reminder: process.env.HASSAN_TPL_REMINDER || ''
    }
  },

  gemini: {
    key: process.env.HASSAN_GEMINI_API_KEY || process.env.GEMINI_API_KEY,
    // Tried in order; a model Google has retired (404) is skipped.
    models: [...new Set([process.env.HASSAN_GEMINI_MODEL, 'gemini-3.6-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest', process.env.GEMINI_MODEL].filter(Boolean))],
    retryDelaysMs: [1500, 4000] // when Google is busy (429/500/503), wait and try the same model again
  },

  alertEmail: process.env.HASSAN_ALERT_EMAIL || '',

  services: json(process.env.HASSAN_SERVICES, DEFAULT_SERVICES),
  locations: json(process.env.HASSAN_LOCATIONS, DEFAULT_LOCATIONS),
  slotMinutes: num(process.env.HASSAN_SLOT_MINUTES, 30),
  clientsPerSlot: num(process.env.HASSAN_CLIENTS_PER_SLOT, 1),
  minHoursAhead: num(process.env.HASSAN_MIN_HOURS_AHEAD, 2),
  bookingDaysAhead: num(process.env.HASSAN_BOOKING_DAYS_AHEAD, 7),
  slotsToOffer: num(process.env.HASSAN_SLOTS_TO_OFFER, 8),
  paymentNote: process.env.HASSAN_PAYMENT_NOTE || 'Payment is at the lab on the day.',

  contactNumber: process.env.HASSAN_CONTACT_NUMBER || '+92 303 901 9991',
  // Real Google Maps link for the lab. Hassan may share ONLY this link.
  mapsLink: process.env.HASSAN_MAPS_LINK || '',
  // Wait this long after a message so quick back-to-back messages get one reply.
  replyDelayMs: num(process.env.HASSAN_REPLY_DELAY_MS, 6000)
});

module.exports = { config, DEFAULT_SERVICES, DEFAULT_LOCATIONS };

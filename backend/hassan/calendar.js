// Google Calendar for Hassan's bookings (free, via a Google service account).
// - every booking becomes an event in the PP Bookings calendar,
// - cancelling a booking in the inbox deletes its event,
// - anything you add to the calendar yourself blocks that time for Hassan.
const axios = require('axios');
const crypto = require('crypto');

const API = 'https://www.googleapis.com/calendar/v3';
const b64url = (b) => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

// GOOGLE_SERVICE_ACCOUNT_JSON may be the raw JSON or base64 of it.
const parseServiceAccount = (raw) => {
  if (!raw) return null;
  try {
    const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const sa = JSON.parse(text);
    return sa.client_email && sa.private_key ? sa : null;
  } catch (e) {
    console.warn('[hassan] GOOGLE_SERVICE_ACCOUNT_JSON could not be read:', e.message);
    return null;
  }
};

const createCalendar = ({ calendarId, serviceAccount, http = axios, now = () => Date.now() }) => {
  const sa = serviceAccount;
  if (!calendarId || !sa) return null;
  let token = null;

  const accessToken = async () => {
    if (token && token.exp > now() + 60000) return token.value;
    const iat = Math.floor(now() / 1000);
    const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = b64url(JSON.stringify({
      iss: sa.client_email, scope: 'https://www.googleapis.com/auth/calendar',
      aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600
    }));
    const sig = crypto.createSign('RSA-SHA256').update(`${head}.${claim}`).sign(sa.private_key);
    const res = await http.post('https://oauth2.googleapis.com/token', new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${head}.${claim}.${b64url(sig)}`
    }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 });
    token = { value: res.data.access_token, exp: now() + (res.data.expires_in || 3600) * 1000 };
    return token.value;
  };

  const call = async (method, path, data, params) => {
    const res = await http.request({
      method, url: `${API}/calendars/${encodeURIComponent(calendarId)}${path}`, data, params,
      headers: { Authorization: `Bearer ${await accessToken()}` }, timeout: 15000
    });
    return res.data;
  };

  return {
    // Times blocked by anything in the calendar that Hassan didn't create.
    async busyBetween(from, to) {
      const out = [];
      let pageToken;
      do {
        const data = await call('get', '/events', undefined, {
          timeMin: from.toISOString(), timeMax: to.toISOString(),
          singleEvents: true, orderBy: 'startTime', maxResults: 250, pageToken
        });
        for (const ev of data.items || []) {
          if (ev.status === 'cancelled' || ev.transparency === 'transparent') continue;
          if (ev.extendedProperties?.private?.hassanBooking) continue; // our own bookings are counted already
          const start = ev.start?.dateTime || (ev.start?.date && `${ev.start.date}T00:00:00+05:00`);
          const end = ev.end?.dateTime || (ev.end?.date && `${ev.end.date}T00:00:00+05:00`);
          if (start && end) out.push({ start: new Date(start), end: new Date(end) });
        }
        pageToken = data.nextPageToken;
      } while (pageToken);
      return out;
    },

    async createEvent(booking, minutes) {
      const start = new Date(booking.start);
      const end = new Date(start.getTime() + minutes * 60000);
      const ev = await call('post', '/events', {
        summary: `PP: ${booking.fullName} – ${booking.serviceLabel}`,
        location: booking.location,
        description: `Phone: +${booking.phone}\nService: ${booking.serviceLabel} (PKR ${Number(booking.price).toLocaleString('en-US')})\nBooked by Hassan on WhatsApp.`,
        start: { dateTime: start.toISOString(), timeZone: 'Asia/Karachi' },
        end: { dateTime: end.toISOString(), timeZone: 'Asia/Karachi' },
        extendedProperties: { private: { hassanBooking: String(booking._id || 'yes') } }
      });
      return ev.id;
    },

    async deleteEvent(eventId) {
      if (!eventId) return;
      try { await call('delete', `/events/${encodeURIComponent(eventId)}`); }
      catch (e) { if (![404, 410].includes(e.response?.status)) throw e; }
    }
  };
};

module.exports = { createCalendar, parseServiceAccount };

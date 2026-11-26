# Hassan — PeakPerformance WhatsApp sales agent

Hassan answers WhatsApp enquiries on the business number, qualifies leads, books
evening slots, follows up, and hands chats to a person when needed. The team sees
everything in **Hassan inbox** in the PP dashboard (admins only).

Free mode (default) only sends messages that cost nothing:
- replies within 24 hours of the lead's last message (ad leads are free for
  7 days; everyone else uses Meta's 1,000 free replies a month — Hassan stops at the
  limit and emails you),
- Day 3 / Day 7 follow-up templates only for leads who came from a
  Click-to-WhatsApp ad, inside their free 7-day window.

## How it decides

1. Hard rules first (no AI): partnerships, complaints or "talk to someone" →
   Faraz; "are you a bot?" → honest answer. Price pushback or discount requests
   → Hassan says our prices are fixed and the same for everyone, then offers two
   slots (if the AI can't write a safe reply, a standard fixed-price reply is sent). Pain or injury → Hassan
   says he's noted it, that they need to visit our physio to assess it, gives
   the physio price and offers two slots (no advice, no diagnosis). If the AI
   can't write a safe reply, a standard physio referral is sent instead.
2. Otherwise Gemini writes the reply from the playbook (`playbook.js`).
3. Every reply is checked (`rules.js`): only list prices, no equipment brands,
   no "online", no discounts or guarantees, never claims to be human. A failing
   reply is retried once, then the chat is handed to Faraz (or, for price or pain, the standard reply is sent).
4. Bookings are made by the server, not the AI: the slot must be free, and the
   confirmation text is fixed.

When Hassan hands off, he pauses on that chat and emails `HASSAN_ALERT_EMAIL`.
Turn him back on from the Inbox.

## Settings (backend `.env`)

| Setting | What it is |
| --- | --- |
| `HASSAN_ENABLED` | `true` to switch Hassan on |
| `HASSAN_FREE_MODE` | `true` (default): never send paid messages |
| `WHATSAPP_TOKEN` | Permanent access token (Meta → System user) |
| `WHATSAPP_PHONE_NUMBER_ID` | From Meta app → WhatsApp → API setup |
| `WHATSAPP_APP_SECRET` | Meta app → Settings → Basic → App secret |
| `WHATSAPP_VERIFY_TOKEN` | Any long random text; paste the same text into Meta's webhook form |
| `HASSAN_GEMINI_API_KEY` | Gemini key for Hassan (falls back to `GEMINI_API_KEY`) |
| `HASSAN_GEMINI_MODEL` | Default `gemini-2.5-flash` |
| `HASSAN_ALERT_EMAIL` | Where booking and handoff alerts go (uses the existing SMTP settings) |
| `HASSAN_TPL_DAY3`, `HASSAN_TPL_DAY7`, `HASSAN_TPL_REMINDER` | Names of the approved templates below |
| `HASSAN_CLIENTS_PER_SLOT` | Default `1` |
| `HASSAN_SLOT_MINUTES` | Default `30` |
| `HASSAN_PAYMENT_NOTE` | Default "Payment is at the lab on the day." |
| `HASSAN_LOCATIONS` | JSON list of places, days (0=Sun) and hours; default Lab every evening 6–10pm, K7 Wed/Thu 6–10pm |
| `HASSAN_SERVICES` | JSON of services and prices; default 8,000 / 3,000 / 6,000 / 10,000 |

## Connecting WhatsApp

1. developers.facebook.com → Create app → add **WhatsApp**.
2. WhatsApp → Configuration → Webhook:
   - Callback URL: `https://<your API domain>/api/whatsapp/webhook`
   - Verify token: the same text as `WHATSAPP_VERIFY_TOKEN`
   - Subscribe to the **messages** field.
3. Test first with Meta's free test number (add your own phone as a recipient).
4. Switch day: export chats you want to keep, turn off two-step verification,
   delete the WhatsApp account on the business number in the app, then add the
   number in the Meta app and verify it by SMS.

## Templates to submit (WhatsApp Manager → Message templates, category Marketing, language English)

- `pp_day3` — "Hi {{1}}, here's what you walk out with after 30 minutes: your Physical Card, what it means for your game, and exactly what to work on. Want a slot this week?"
- `pp_day7` — "Last message from me, {{1}}. Whenever you're ready to stop guessing, just reply BOOK and I'll find you a time. Hassan, Peak Performance"
- `pp_reminder` (category Utility) — "Hi {{1}}, reminder of your Peak Performance session on {{2}}. Please wear sportswear and trainers. Reply here if anything changes."

## Tests

`node --test hassan/hassan.test.js`

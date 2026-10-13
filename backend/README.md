# PeakPerformance.pk Backend

Internal AI-powered sports assessment report generator. Processes VALD assessment PDFs and generates plain-English reports with exercise recommendations.

## Setup

```bash
npm install
cp .env.example .env
# Edit .env with your API keys and MongoDB URI
npm run dev
```

**Exercises auto-seed on first startup.** All 47 exercises load automatically when the server starts (if database is empty).

To manually seed:
```bash
npm run seed
```

## Environment Variables

- `PORT` - Server port (default: 5000)
- `MONGODB_URI` - MongoDB Atlas connection string
- `GROQ_API_KEY` - Groq API key (for development)
- `CLAUDE_API_KEY` - Anthropic API key (for production)
- `AI_PROVIDER` - Switch between `groq` and `claude`
- `FRONTEND_URL` - React frontend URL for CORS

## API Endpoints

### Reports
- `POST /api/report/generate` - Upload PDFs + athlete profile → generates report
- `GET /api/report/:id` - Retrieve report by ID
- `GET /api/report/:id/export` - Get report data for PDF export

- `POST /api/report/custom` - Custom assessment: the tester's chosen tests (any VALD tests + manual tests) become a scoring config for that session (`services/customAssessment.service.js`), run through the same engine, Gemini and number check. Manual tests use the chosen sport's research anchors (or the only sport that has the test); VALD tests are scored from VALD cut-offs/band and feed the stat set in Admin › VALD test mapping (battery tests keep their usual stat); unmapped/"show only" VALD tests are shown, not scored. OVR = plain mean of the scored stats, only with 3+ scored stats ("No OVR: custom session" otherwise). The config is saved on the report so it can be re-scored. Football, padel and cricket configs are untouched.
- `POST /api/report/football` - Football report from manually entered test results (VALD PDFs optional, kept as reference)
- `POST /api/report/padel` - Padel report, same flow (`scoring/padel_v1.json`; dominant hand required)
- `POST /api/report/cricket` - Cricket report, same flow (`scoring/cricket_v1.json`; bowling arm required)

### Football scoring (Football OVR Scoring Spec v1)

Football reports don't let the AI produce numbers. The flow:

1. Tester enters results on the New report page (sport = Football).
2. `scoring/scoring.js` scores every test, stat and the OVR, deterministically.
   Benchmarks, weights and thresholds live in `scoring/football_v1.json`.
3. `services/footballReport.service.js` sends the finished scores to Gemini
   (always Gemini, whatever `AI_PROVIDER` says) and gets the text back.
4. Any number in Gemini's text that isn't in the scores gets the answer
   rejected and retried (3 attempts, then the report fails cleanly).
5. The report stores the tester's entry, the engine output, the exact Gemini
   payload and the config version. "Regenerate" re-scores with the current config.

Padel uses the same engine and pipeline (`services/scoredReport.service.js` holds both
sports; `footballReport.service.js` keeps football's original names). Padel adds two
flags: hip adduction below 80% of abduction (amber "groin risk"), and a Shoulder ER
gap where the dominant arm is weaker is "monitor" (never red, no Power cap).
Padel's manual-test anchors are interim and approximate (adult male).

Cricket (`cricket_v1.json`) cites a source for every anchor in its `sources` block.
Agility uses the 505 test (devised for cricket), anchored on published male
cricketer data. The seated 4 kg medicine ball throw is `benchmark_pending`:
recorded on the card but not scored (and the OVR is Provisional) until sourced
benchmarks are added to the config. Yo-Yo IR1 is entered as level.shuttle and scored on
cumulative metres. Bowling-arm ER below 66% of IR is an amber "shoulder balance"
flag; a bowling-arm-weaker gap is "monitor".

`scoring/scoring.js` is a JavaScript port of `../peakperformance_scoring/scoring.py`.
Keep `scoring/football_v1.json` identical to `../peakperformance_scoring/football_v1.json`
(a test checks this). Needs `GEMINI_API_KEY`.

```bash
npm test          # engine (the 14 spec checks + sample_output.json) and football pipeline
npm run parity    # needs python3: scores 5000 random sessions with both engines, must be identical
```

### VALD auto-fill (HumanTrak + Dynamo)

The test form's "Pull from VALD" finds the athlete in VALD and fills their
latest HumanTrak and Dynamo results (raw values only; testers still enter the
VALD cut-offs or band). Credentials stay on the backend.

- `GET /api/vald/status` - configured / connected (never returns credentials)
- `GET /api/vald/profiles?q=name` - find the athlete. Forgiving: ignores case, accents and extra spaces; matches part of the first name, last name or both; returns every match with date of birth and last Dynamo/HumanTrak test date, plus close spellings when nothing matches
- `GET /api/vald/link?name=...`, `PUT /api/vald/link` - the VALD profile remembered for an athlete name (saved when a tester picks the athlete; stored in the `valdlinks` collection)
- `GET /api/vald/latest?profileId=...&sport=football|padel|cricket` - form fills
- `GET /api/vald/latest?profileId=...&sport=...` returns `fills` (battery tests, scored as before) and `additional` (every other VALD test: shown on the report under "Additional VALD results", never scored or counted in the OVR). Most recent result per test and per side.
  - Dynamo is matched on `bodyRegion` + `movement` (+ side from `repetitionTypeSummaries[].laterality`): Knee+Extension, Hip+Extension, Shoulder+External/Internal Rotation, Elbow+Extension, Hip+Abduction/Adduction.
  - HumanTrak is matched on the test type name (from `/v2/test-type/metrics`) and one clear metric (Single Leg Stand → hold time, Overhead Squat → composite score, Trunk Rotation → rotation); if more than one metric could fit, nothing is filled until an admin picks one.
  - Organisation tests are synced incrementally (by `modifiedDateUtc`, as VALD's guides describe) and kept in memory.
- `GET /api/vald/raw?profileId=...` - admins only: the athlete's raw VALD tests (test, body region, movement, side, date, result)
- `GET /api/vald/mappings`, `PUT|DELETE /api/vald/mappings/:key` - admins only: every VALD test type seen, and the admin's choice (stat or "show only", plus the HumanTrak metric). Stored in `valdtestmappings`; nothing is ever assigned automatically.
- `GET /api/vald/diagnose` - step-by-step check of every VALD call (login, tenants in each region, profiles, Dynamo, HumanTrak) with HTTP status and advice; no secrets. Also the "Run VALD check" button on the form.

Environment variables:

| Variable | Required | Value |
|---|---|---|
| `VALD_CLIENT_ID` | yes | client ID from VALD |
| `VALD_CLIENT_SECRET` | yes | client secret from VALD |
| `VALD_REGION` | yes | `aue` (Australia East), `use` (US East) or `euw` (Europe West) |
| `VALD_TENANT_ID` | recommended | your VALD Hub Organization ID (Management > Organization), the same value valdr uses. If unset, the app lists tenants, which many VALD clients are not allowed to do (403) |
| `VALD_LOOKBACK_DAYS` | no | how far back to look for tests (default 365) |
| `VALD_AUTH_URL`, `VALD_AUDIENCE` | no | override login (defaults `https://auth.prd.vald.com/oauth/token`, `vald-api-external`) |
| `VALD_TENANTS_URL`, `VALD_PROFILES_URL`, `VALD_DYNAMO_URL`, `VALD_HUMANTRAK_URL` | no | override a service host (default `https://prd-{region}-api-{service}.valdperformance.com`) |

The calls, parameter names and headers match VALD's own R package (valdr):
`/profiles?tenantId=`, Dynamo `/v1/test/tests-by-modified-date?TenantId=&ModifiedFromUtc=`,
HumanTrak `/v2/tests-by-modified-date?TenantId=&ModifiedFromUtc=`. The "Duende ID" on
VALD's credentials page belongs to VALD's old login service and is not used.

### Exercises
- `GET /api/exercises` - Get all exercises
- `POST /api/exercises` - Create new exercise
- `PUT /api/exercises/:id` - Update exercise
- `DELETE /api/exercises/:id` - Delete exercise

### Health
- `GET /api/health` - Health check

## Database

MongoDB Atlas with 3 collections:
- `exercises` - Exercise database (auto-seeded with 47 exercises on first startup)
- `reports` - Generated assessment reports

## Report Generation Flow

1. Frontend uploads VALD PDFs + athlete profile JSON
2. Backend extracts text from PDFs (detects HumanTrak vs Dynamo)
3. Builds AI prompt with athlete data + VALD text + exercise list
4. Calls Groq or Claude API based on `AI_PROVIDER`
5. Parses JSON response and validates required fields
6. Flags asymmetries >10% as priority
7. Saves report to MongoDB
8. Cleans up temp files
9. Returns report ID to frontend

## Deploy

```bash
npm start
```

Production: Set `AI_PROVIDER=claude` and use Claude API keys

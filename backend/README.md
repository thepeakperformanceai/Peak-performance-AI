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

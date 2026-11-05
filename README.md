# SentinelHome

SentinelHome is a household safety and disaster-readiness app. It combines scheduled earthquake monitoring, household risk context, safety guidance, and alert delivery with a React dashboard.

## What’s in the app

- Public information pages: Home, How it works, Features, Disasters, About, and Blog.
- Account sign-in and household registration.
- A signed-in dashboard with household status, risk information, monitoring history, and alert check-in.
- Scheduled monitoring against the USGS significant-earthquake feed. Nearby events are assessed by the backend workflow.
- Preparedness guidance and optional Telegram, WhatsApp, SMS, and voice delivery, depending on configured providers.
- MongoDB persistence in production, with in-memory storage available for local development.

**Monitoring coverage:** automated scheduled monitoring currently covers earthquakes. Flood and cyclone pages provide preparedness information; they are not automated hazard monitors in the current implementation.

## Application structure

```text
backend/
  app/                 Flask API, persistence, services, and scheduler
  agent/               Risk assessment, guidance, and alert workflow
  ml/                  Model artifacts, datasets, and notebooks
  tests/               Backend unit tests
frontend/
  src/pages/           Public pages, authentication, registration, dashboard
  public/assets/       Site images and icons
```

## Requirements

- Python 3.11 (the Render service is configured for Python 3.11.11)
- Node.js and npm
- MongoDB, if using persistent local storage
- Optional provider accounts and credentials for AI guidance, vector retrieval, and notifications

## Run locally

### 1. Configure the backend

Create a local `.env` in the repository root or `backend/.env`. Keep it out of version control and never commit provider keys or passwords. Set at least:

```dotenv
PERSISTENCE=memory
ENABLE_SCHEDULER=false
FRONTEND_ORIGIN=http://localhost:5173
SESSION_SECRET=replace-with-a-random-local-secret
```

For MongoDB storage, set `PERSISTENCE=mongo`, `MONGO_URI`, and `MONGO_DB_NAME`. The backend also reads optional configuration for AI and notification providers; see [`.env.example`](.env.example) for variable names. Automatic Telegram delivery requires `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, and `AUTO_SEND_ALERTS=true`. Keep automatic escalation disabled unless voice delivery is configured and intended.

Create and activate a virtual environment from the repository root:

```bash
python -m venv .venv
# macOS/Linux
source .venv/bin/activate
# Windows PowerShell: .venv\Scripts\Activate.ps1
```

Then install backend dependencies and start Flask:

```bash
cd backend
pip install -r requirements.txt
python -m flask --app app.main run --port 5000
```

### 2. Configure and start the frontend

Create `frontend/.env.local`:

```dotenv
VITE_API_BASE_URL=http://localhost:5000
```

Then run:

```bash
cd frontend
npm install
npm run dev
```

Open the local Vite URL shown in the terminal (usually `http://localhost:5173`).

## Main routes

| Route | Page |
| --- | --- |
| `/` | Public home page |
| `/how-it-works` | Monitoring and response flow |
| `/features` | Dashboard and household capabilities |
| `/disasters` | Hazard coverage and preparedness notes |
| `/about` | SentinelHome mission and principles |
| `/blog` | Preparedness articles |
| `/register` | Create an account and register a household |
| `/login` | Sign in |
| `/dashboard` | Signed-in household dashboard |
| `/dashboard/:householdId` | Dashboard for a specific household |
| `/internal/earthquake-simulation` | Internal controlled earthquake simulation UI |

## Backend status and operations

- `GET /health` reports service health and counts.
- `GET /api/admin/status` reports scheduler state, registered households, and alert counts.
- `POST /api/admin/monitoring/run` starts an immediate live monitoring cycle.
- `POST /api/admin/alerts/process` processes due pending alerts.
- `POST /api/admin/simulation/earthquake` accepts a controlled simulation when `SIMULATION_PASSWORD` is configured.

The monitoring interval is configured by `MONITOR_INTERVAL_MINUTES` (30 minutes in `backend/render.yaml`). The scheduler runs inside the Flask process; deploy it with a single application worker unless scheduler coordination is moved to a dedicated worker or distributed scheduler. Multiple web workers can start duplicate in-process schedulers.

Alert delivery settings include `AUTO_SEND_ALERTS`, `AUTO_ESCALATE_ALERTS`, and `ALERT_CONFIRMATION_TIMEOUT_MINUTES`. Escalation calls also require Twilio credentials and a reachable voice callback URL. Provider credentials belong in the deployment’s secret environment settings, not in the repository.

## Deployment

- The frontend is a Vite app with a Vercel rewrite configured in [`frontend/vercel.json`](frontend/vercel.json). Set `VITE_API_BASE_URL` to the public backend URL in Vercel.
- The backend Render Blueprint is [`backend/render.yaml`](backend/render.yaml). Configure its unsynced values, including `MONGO_URI` and `FRONTEND_ORIGIN`, in Render.
- Set `SESSION_COOKIE_SECURE=true` when serving over HTTPS. Use a strong `SESSION_SECRET` in production.
- Ensure the frontend origin in `FRONTEND_ORIGIN` exactly matches the deployed frontend origin.

## Tests and build

From `backend`:

```bash
python -m unittest discover -s tests
```

From `frontend`:

```bash
npm run build
npm run lint
```


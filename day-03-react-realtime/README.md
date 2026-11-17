# Day 3 — Live dashboard

**Programme:** Operational Data Analytics and Dashboard Engineering for SupTech Systems
**Client context:** Bank of Tanzania (prototype only)

Day 3 puts the supervisory picture in front of a supervisor and keeps it in
front of them while the data moves: a live update mechanism over Server-Sent
Events, and a responsive Next.js dashboard over the Day 2 API. The API is
public and read-only for synthetic prototype data; no token or login is needed.

> All institution names, identifiers, reporting values and records in this
> repository are synthetic. The thresholds behind the numbers on the screen
> are illustrative prototype values, not a regulatory reporting standard.

---

## What this day delivers

| Capability | Where |
| --- | --- |
| An event broker with a bounded history and an exact replay. | `backend/events.py` |
| A watcher that turns a new pipeline run into an event. | `backend/watcher.py` |
| A public, read-only Server-Sent Events endpoint for synthetic data. | `backend/app.py` |
| A Next.js dashboard: live status, indicators, tables, filters, drill-downs, charts and analyst workspace. | `dashboard/app/`, `dashboard/src/` |
| A stream reader with a backoff and a catch-up replay. | `dashboard/src/live.ts` |
| The tests on both sides. | `tests/test_day3_*.py`, `dashboard/src/__tests__/` |

The full narrative is in `docs/architecture/day3-live-dashboard.md`.

---

## Repository map

```text
day-03-react-realtime/
├── README.md
├── backend/
│   ├── app.py                 the Day 2 API plus the live endpoint
│   ├── day2_bridge.py         access to the Day 2 modules
│   ├── events.py              the event broker
│   └── watcher.py             the run watcher
└── dashboard/
    ├── app/
    ├── package.json
    ├── tsconfig.json
    ├── next.config.ts         the local API proxy
    ├── vitest.config.ts       the frontend test settings
    └── src/
        ├── App.tsx            the shell and the two drill-downs
        ├── api.ts             the one client for the Day 2 API
        ├── live.ts            the stream reader
        ├── queryPlanner.ts    the allowlisted read-only query planner
        ├── format.ts          how a value is presented
        ├── types.ts           the shapes the API serves
        ├── components/        the panels
        ├── hooks/             the read model and the live connection
        └── __tests__/         the frontend tests
```

---

## Quick start

```bash
# 1. The pipeline.
python day-01-data-engineering/src/validation.py
python day-02-supervisory-analytics/src/analytics.py

# 2. The API, with the live endpoint.
uvicorn app:app_factory --factory --app-dir day-03-react-realtime/backend

# 3. The dashboard.
cd day-03-react-realtime/dashboard
npm install
npm run dev
```

Open http://127.0.0.1:3000. No token is required.

Windows PowerShell:

```powershell
uvicorn app:app_factory --factory --app-dir day-03-react-realtime/backend
```

---

## The tests

```bash
# The backend and the contract between the two sides.
python -m pytest

# The frontend.
cd day-03-react-realtime/dashboard
npm test

# The typecheck and the production build.
npm run build
```

## Deploy on Vercel

Deploy from the repository root so Vercel can build the Day 1 curated data,
the Day 2 read model, and the dashboard together. Next.js and FastAPI are
separate Vercel Services in one project and share the
`suptech-monitor.vercel.app` origin. Vercel Services is currently a beta
feature.

The deployment uses public, read-only API endpoints over synthetic data.
Do not use the prototype to process real supervisory information.

---

## Security notes

- API and live-stream endpoints expose synthetic data and accept read-only
  requests without credentials.
- This is a training prototype, not an identity or access-control system.

# Day 3 — Live dashboard

**Programme:** Operational Data Analytics and Dashboard Engineering for SupTech Systems
**Client context:** Bank of Tanzania (prototype only)

Day 3 puts the supervisory picture in front of a supervisor and keeps it in
front of them while the data moves: a live update mechanism over Server-Sent
Events, and a responsive React dashboard over the Day 2 API.

> All institution names, identifiers, reporting values and records in this
> repository are synthetic. The thresholds behind the numbers on the screen
> are illustrative prototype values, not a regulatory reporting standard.

---

## What this day delivers

| Capability | Where |
| --- | --- |
| An event broker with a bounded history and an exact replay. | `backend/events.py` |
| A watcher that turns a new pipeline run into an event. | `backend/watcher.py` |
| A Server-Sent Events endpoint, protected like every other endpoint. | `backend/app.py` |
| A React dashboard: live status, indicators, tables, filters, drill-downs, charts. | `dashboard/src/` |
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
    ├── index.html
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts         the development proxy and the test settings
    └── src/
        ├── App.tsx            the shell and the two drill-downs
        ├── api.ts             the one client for the Day 2 API
        ├── live.ts            the stream reader
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
export SUPTECH_API_TOKEN="<a value you choose>"
uvicorn app:app_factory --factory --app-dir day-03-react-realtime/backend

# 3. The dashboard.
cd day-03-react-realtime/dashboard
npm install
npm run dev
```

Open http://127.0.0.1:5173 and type the token in.

Windows PowerShell:

```powershell
$env:SUPTECH_API_TOKEN = "<a value you choose>"
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
the Day 2 read model, and the dashboard together. The FastAPI API and static
React dashboard share the `suptech-monitor.vercel.app` origin.

Set `SUPTECH_API_TOKEN` in the Vercel project's Production environment before
deploying. Keep it out of source control and use the same value in the
dashboard unlock screen.

---

## Security notes

- The token is typed into the browser and held in memory. It is never
  written to storage, never put in a URL and never sent anywhere except the
  API header.
- The stream is read with `fetch`, not with `EventSource`, because
  `EventSource` cannot send an `Authorization` header and the usual
  workaround puts the token in a URL.
- The live endpoint uses the same dependency factory as the rest of the
  API, so the two cannot drift apart.
- The token scheme is a training scheme: one shared token, no users, no
  roles, no expiry and no record of who looked at what.

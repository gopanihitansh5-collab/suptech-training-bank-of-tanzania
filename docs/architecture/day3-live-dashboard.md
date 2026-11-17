# Day 3 live dashboard

**Programme:** Operational Data Analytics and Dashboard Engineering for SupTech Systems
**Status:** Day 3. This is the operational narrative of `day-03-react-realtime/`.

> All data in this repository is synthetic training data. The thresholds behind
> the numbers on the screen are illustrative prototype values.

---

## 1. What Day 3 adds

Day 1 made the data trustworthy. Day 2 made it supervisory. Day 3 puts it in
front of a supervisor and keeps it in front of them while the data moves.

Two things are built:

- **A live update mechanism.** The API streams events over Server-Sent
  Events, and the dashboard reads that stream with a header, a backoff and
  a replay.
- **A responsive Next.js dashboard.** Live status, the sector indicators, the
  exceptions, the register, filters and two drill-downs.

Nothing else changed. The dashboard reads the Day 2 API and nothing else. It
does not read the submitted file, it does not recompute an indicator and it
does not hold a fixture of the data.

---

## 2. The live update mechanism

### The broker

`day-03-react-realtime/backend/events.py`.

The broker holds a bounded history of events, publishes each event to every
subscriber and replays the events a subscriber missed when it comes back.

Three properties matter, and all three are about the reconnect:

| Property | Why it matters |
| --- | --- |
| Events are numbered | The number is what the client sends back as `Last-Event-ID`, and it is what makes a replay exact. |
| The history is bounded | A broker that remembers everything is a leak with a database attached. The last hundred events are kept. |
| A reconnect gets what it missed | The broker replays the events after the identifier the client last saw, and only those. |

The subscriber joins the fan-out **before** `subscribe` returns, so an event
published a moment later cannot be missed in the gap between the replay and
the live stream. The state is guarded by a plain thread lock for that
reason: an asyncio lock could only be taken from inside a coroutine, and a
subscriber that registered late would miss what was published in between.

### The watcher

`day-03-react-realtime/backend/watcher.py`.

The watcher compares two run identifiers and publishes the difference. It
reads the Day 2 analytics manifest, which is the published statement of a
run: it carries the run identifier, the counts and the hashes of the inputs,
so an event built from it says exactly which run the dashboard is about to
show.

The first reading establishes the baseline and publishes nothing. A run that
was already published before the watcher looked is not news: the dashboard
that connects afterwards is told which run the API is serving, and it fetches
the data.

### The endpoint

`day-03-react-realtime/backend/app.py` builds the Day 2 application and adds
one route, `/api/v1/events`.

Server-Sent Events was chosen over WebSockets for three reasons that matter
in a supervisory tool:

- it is one way, and the dashboard only needs to hear about changes;
- it is plain HTTP, so it passes through proxies without a protocol upgrade;
- it reconnects on its own and replays what was missed.

The endpoint is public and read-only, like the rest of the API. This is safe
only because the prototype serves synthetic training data; it must not be used
with real supervisory information.

---

## 3. The dashboard

`day-03-react-realtime/dashboard/`.

| Part | What it does |
| --- | --- |
| `src/api.ts` | The one client for the Day 2 API. Every number on the screen comes through it. |
| `src/live.ts` | The stream reader: the parser, the backoff and the replay. |
| `src/hooks/useDashboard.ts` | Loads the read model and reloads it. |
| `src/hooks/useLiveEvents.ts` | Keeps the connection and reports its state. |
| `src/components/` | The live status, the indicators, the tables, the drill-downs and the charts. |

### The read model, and nothing else

The dashboard renders what the API serves. There is no fixture, no
hard-coded number and no fallback data: a screen that shows a plausible
number when the API is down is worse than a screen that says the API is
down. `tests/test_day3_dashboard.py` checks the source for the shapes a
fixture would have.

### Public demo access

The dashboard opens directly without a login or token. API and event-stream
routes are public and read-only for synthetic training data only.

### The live status is always on the page

A supervisory screen that has quietly stopped updating still looks like a
supervisory screen. The connection state is therefore always visible, and
it says plainly when the data might be stale.

### The reconnect

The client remembers the identifier of the last event it saw and sends it
back as `Last-Event-ID` when it reconnects, so the dashboard catches up
rather than starting again. The backoff grows while the connection keeps
failing and resets as soon as a connection delivers an event, so a server
that comes back is picked up quickly and a server that is down is not
hammered.

### What is on the screen

| Panel | Reads |
| --- | --- |
| Live status | The state of the stream, the events received and the run being served. |
| Indicator cards | The sector summary: deposits, loans, the ratio, the concentration, the coverage, the watchlist exposure and the exception counts. |
| Exceptions table | Every exception that matches the filters, most urgent first, with the observed value and the limit it breached. |
| Exceptions by severity | The same exceptions counted by severity. |
| Loan to deposit ratio | The ratio of every institution in the period. A ratio the API could not compute is left out rather than drawn as zero. |
| Supervised institutions | The register with the exception count of each institution. |
| Exception drill-down | The threshold evidence, the reason a supervisor would give, and the data quality findings, marked as the cause or as context. |
| Institution drill-down | The register details, the indicators with their calculation basis, and the exceptions. |

---

## 4. How to run it

Three processes: the pipeline, the API and the dashboard.

```bash
# 1. The pipeline. It writes the Day 1 and Day 2 artefacts.
python day-01-data-engineering/src/validation.py
python day-02-supervisory-analytics/src/analytics.py

# 2. The API, with the live endpoint.
uvicorn app:app_factory --factory --app-dir day-03-react-realtime/backend

# 3. The dashboard.
cd day-03-react-realtime/dashboard
npm install
npm run dev
```

Then open http://127.0.0.1:3000. No token is required.

The Next.js development server proxies `/api` to the backend, so the browser only
ever talks to one origin. That keeps the CORS rules out of the way and it
uses the same API paths in local and deployed environments.

### Watch it update

With the dashboard open, run the pipeline again:

```bash
python day-01-data-engineering/src/validation.py
python day-02-supervisory-analytics/src/analytics.py
```

The watcher notices the new run identifier, publishes a `run.available`
event, and the dashboard reloads the read model. The live status says how
many events have arrived.

### The tests

```bash
python -m pytest                                   # the backend and the contract
cd day-03-react-realtime/dashboard && npm test      # the frontend
cd day-03-react-realtime/dashboard && npm run build # the typecheck and the build
```

---

## 5. What Day 3 deliberately does not do

- **No threshold highlighting, no comparison view and no trend view.** Those
  are Day 4. The dashboard shows one period, because the curated layer has
  one.
- **No triage workflow.** The API is read only, and an exception has a
  status of `open`.
- **No production identity.** One shared token, typed into the browser and
  held in memory.
- **No WebSocket.** Server-Sent Events is enough for a dashboard that only
  listens.
- **No offline mode.** A dashboard that cannot reach the API says so.
- **No code splitting.** The bundle is one chunk and it is larger than
  comfortable, because the charts library is in it. That is a Day 4 and
  Day 5 conversation, not a Day 3 one.

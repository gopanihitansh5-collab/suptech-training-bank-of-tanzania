# SupTech Monitor — end-to-end user journey

## Purpose and scope

This guide describes how a supervisor or training-demo user enters the
prototype, moves through its pages, follows evidence, and leaves with a useful
result. It is both a product journey and a navigation reference for the
current Day 6 Next.js application.

The application is a synthetic-data training prototype, not a Bank of Tanzania
system. Institutions, records, metrics, reports, and threshold comparisons
are fictional or illustrative. A review signal is a prompt for human review,
not a confirmed violation or official regulatory decision.

This guide separates:

- **Available now** — a route or task is present in the current Day 6 app.
- **Limited** — the page works, but some data, integrations, or capabilities
  are unavailable or deliberately constrained.
- **Follow-up needed** — a route or action exists but needs a clearer or safer
  navigation/behavior contract before it is presented as a complete workflow.

Check the Day 6 [feature matrix](../day-06-nextjs-full/docs/FEATURE_MATRIX.md)
and [single source of truth](../day-06-nextjs-full/docs/SOURCE_OF_TRUTH.md)
for implementation status and non-negotiable behavior. This guide describes
the user-facing flow; it does not override those contracts.

## User outcome

At the end of a successful walkthrough, the user should be able to:

1. Understand the synthetic reporting portfolio and choose a reporting
   period.
2. Locate a fictional institution and inspect its submitted reports.
3. Understand a selected indicator or review signal, including its source
   period and evidence.
4. Ask a constrained analytical question or find a source record, then
   validate the result against the cited data.
5. Preview and export a bounded report, or inspect a clearly labelled data
   intake preview.
6. See which local services are actually available and what remains outside
   the prototype.

## Entry, session, and shared navigation

### Entry point: sign-in

1. The user opens the application. A request to a protected workspace page
   without a valid demo session leads to `/login`.
2. In local development, the user signs in with the locally configured demo
   account. On hosted Preview/Production, the page also offers one-click demo
   access.
3. On success, the user lands on the executive overview at `/`. Invalid
   credentials or an unavailable service must be shown as an error, not
   converted into a successful session.

The signed local demo session is for the training prototype only. It is not
production identity, a security assurance, or evidence of access control for
real supervisory information.

### Shared shell

After sign-in, every workspace page uses the shared shell:

- **Sidebar / mobile navigation:** routes grouped under Supervision,
  Workflows, Intelligence, and Platform.
- **Breadcrumb:** identifies the active module and keeps the user oriented.
- **Session area:** shows the demo-session identity and role; Logout ends the
  browser session.
- **Page assistant:** opens a contextual assistant on the current page. It
  uses the active page and supported filters as context and asks the user to
  confirm the synthetic-data notice before sending a question.
- **Synthetic-data notice:** remains visible on relevant screens so numbers
  and thresholds are not mistaken for official information.

Navigation changes should preserve supported query filters when a page link
explicitly carries them. If a data source is unavailable, show an unavailable
or error state; do not make an outage look like a valid empty portfolio.

## Page navigation map

| Navigation group / page | Route | How the user arrives | What the user does and what the page returns | Why it is useful / next step |
| --- | --- | --- | --- | --- |
| **Sign in** | `/login` | First visit, expired/missing session, or Logout followed by sign-in | Enters the local demo credentials or uses hosted one-click demo access. The page explains the synthetic-training boundary. | Establishes a demo session, then opens Overview. It must not be presented as production authentication. |
| **Supervision — Overview** | `/` | Successful sign-in; click **Overview**; follow an Overview link | Chooses a reporting period; reviews institution/report totals, open review signals, deposits, completeness, portfolio trends, and recent signals. Metric cards carry the selected period where applicable. | Provides orientation. Go to Institutions to investigate a portfolio member, Analytics to explain an indicator, Exceptions to inspect review signals, or Reports to inspect submissions. |
| **Supervision — Institutions** | `/institutions` | Sidebar; Overview institution card; recent-signal institution link | Searches the fictional register by name or ID, pages through results, and opens an institution profile. | Starts an entity-level investigation. Select a row to open its reporting history and recorded signals. |
| **Institution profile** | `/institutions/[institutionId]` | Select an institution in the directory or a linked institution name elsewhere | Reviews profile metadata, latest reporting period, headline values, report history, source-record IDs, and the institution's review signals. | Connects portfolio totals to institution-level source reports. Use the directory to return, or continue to Analytics, Exceptions, or Reports with the institution and period as context. |
| **Supervision — Supervisory analytics** | `/analytics` | Sidebar; Overview deposits/completeness card; a related institution/exception link | Filters by period and indicator; reads training values, formula text, portfolio trend, and a selected indicator's historical trend when available. | Explains what a metric represents and its history. Continue to the institution profile or exception register to inspect a specific institution-level record. |
| **Supervision — Exceptions & alerts** | `/exceptions` | Sidebar; Overview open-signal card; Assistant/search result | Filters by text, institution, period, severity, and status; reviews the observed value, illustrative boundary, severity, status, and related report identifier. Results are paginated. | Triage begins with evidence inspection, not a conclusion. Continue to the institution history or a period-filtered report. A signal is never by itself proof of non-compliance. |
| **Review-signal detail** | `/exceptions/[exceptionId]` | Intended from a selected signal or a direct link | Shows the signal, institution, period, indicator, observed value, training threshold, status, and source report; provides related links to the institution, analytics, and register. | Provides a focused evidence view. **Follow-up needed:** the current register does not expose a clear link to this detail route, and the detail page renders a status-update form. Reconcile this with the read-only/public-write boundary before treating it as a supported workflow; do not promise persistence or transient behavior without verifying the API contract. |
| **Workflows — Custom reports** | `/reports` | Sidebar; Overview reports-received card; source-report link from a signal | Filters persisted synthetic reports by period and institution, previews a bounded page, and downloads a CSV using those filters (export capped at 1,000 records). | Produces a reusable file for local training review. Saved templates, PDF, and distribution are not available. Return to the source institution or continue to Data Explorer to inspect data inventory. |
| **Workflows — Data Explorer** | `/data-explorer` | Sidebar; workflow follow-up from Reports or system review | Inspects synthetic dataset counts, grain, fields, report rows, import summaries, and recorded processing information. The report-import panel supports CSV validation preview and confirmed commit of synthetic-only reports where enabled. | Makes the data entering analysis inspectable. A preview should be checked before commit; invalid rows, unsupported formats, storage failures, and import limits must be explicit. New persisted reports can affect subsequent dashboard results. |
| **Evidence search** | `/search` | Search/completion path from the assistant or a linked search result; direct route | Searches synthetic documents, reports, institutions, and review signals with optional period, institution, and evidence-type filters. Results show excerpts and citation metadata. | Helps locate the record behind a question. **Limited navigation:** Search is a supporting route, not a sidebar item. From results, open an institution, a report view, a filtered signal register, or a document source preview. |
| **Document source preview** | `/documents/[documentId]?chunk=[index]` | Open a document result from Search or a completed document in Data Explorer | Reads a bounded indexed chunk and its source reference, along with document metadata. The page warns that uploaded text is untrusted and not independently verified. | Lets the user check what a document citation actually says. Return to Search and continue to the related report/institution if linked. |
| **Intelligence — AI supervisory assistant** | `/assistant` | Sidebar; page-assistant follow-up; related question from the overview | Selects or enters a supported question, previews a deterministic read-only plan, confirms execution, and inspects returned evidence/citations and any supported chart or table. Unsupported requests fail closed. | Speeds up bounded analysis without replacing source review. Open linked institutions, periods, signals, or report previews to verify the result independently. |
| **Intelligence — Multi-agent supervision** | `/agents` | Sidebar; optional experimental branch after the direct assistant workflow | Chooses bounded analysis roles, submits a question after the required confirmation, and reviews the returned text/charts against the synthetic aggregate context. | Demonstrates an experimental model-assisted workflow. It is not an authoritative supervisory decision and is optional; use the deterministic assistant and source pages as the primary demo path. |
| **Platform — Integrations & health** | `/system-health` | Sidebar; final operational check; troubleshooting a failed page | Refreshes probes and reviews Day 6 database, configured AI/embedding services, upload storage, row counts, configuration presence, and unavailable external systems. Secret values are not displayed. | Confirms what this particular environment actually has configured. External BoT systems are not connected; a local probe does not establish production readiness. |
| **Platform — Administration & settings** | `/settings` | Sidebar; final configuration/role review | Reads the current demo session, role/permission mirror, code-defined training boundaries, and available administrative evidence. Configuration writes are disabled; the audit export is role-gated where available. | Shows the prototype's administration boundary and why demo roles are not production access controls. Return to Overview or Logout. |
| **Logout** | Action in shared shell | User clicks **Log out** | Clears the browser's demo-session cookie and returns the user to sign-in. | Ends the demo session. This does not make the prototype suitable for real records. |

## Recommended end-to-end walkthrough

The following is the primary narrative for a live prototype demonstration.
Use only the synthetic records already supplied by the environment.

### 1. Enter and establish context

- Open the app and sign in through `/login`.
- Confirm the synthetic-training notice.
- On `/`, choose a reporting period that has data. Use the period control to
  keep the investigation in one reporting cycle.

**User question answered:** “What is happening across this synthetic
portfolio?”

### 2. Choose a signal and identify the institution

- From Overview, open **Open review signals** or use the recent-signal table.
- In `/exceptions`, apply period/severity/status filters as needed.
- Select the associated institution link to open
  `/institutions/[institutionId]`.
- Compare the institution's latest period, report history, source record IDs,
  and recorded review signals.

**User question answered:** “Which fictional entity and source report does
this review signal concern?”

### 3. Understand the measure

- Open `/analytics`.
- Keep the selected reporting period and choose the relevant indicator.
- Read the displayed formula and units; inspect the trend only for periods
  that have actual persisted values.
- Return to the institution profile or signal register to compare the
  portfolio context with the institution-level record.

**User question answered:** “What is being measured, how is it calculated,
and what history is available?”

### 4. Review the evidence, not just the label

- Return to the exception register and inspect the signal's observed value,
  configured training boundary, severity, period, status, and source report.
- Open the institution history or period-filtered report preview to verify
  the underlying synthetic record.
- Treat the comparison as a training review prompt only.

**User question answered:** “What persisted synthetic evidence caused this
signal?”

**Navigation caveat:** the detail route exists, but the current register does
not make the route discoverable through a clear signal link. If the demo needs
to show the detail screen, use a verified direct link or fix the register
navigation first. Do not use the detail-page status form as a production
workflow; its behavior must be reconciled with the product's public
read-only boundary before demonstration.

### 5. Ask a constrained question and verify the answer

- Open `/assistant` or launch the page-aware assistant from the current page.
- Ask a supported question scoped to the current period/institution.
- Review the query plan, filters, and evidence before confirming execution.
- Open the cited records or related pages to verify the answer.
- If a question is unsupported, the assistant should explain the limitation
  rather than invent a result.

The model is optional and environment-configured. The assistant must use only
approved operations; it must not run arbitrary SQL or change records. The
separate `/agents` workspace is experimental and should be shown only as an
optional branch with the same synthetic-data caveat.

**User question answered:** “Can I ask a natural-language question and still
see what evidence supports the answer?”

### 6. Produce or inspect an output

- Open `/reports` from the sidebar, an Overview card, or a source-report link.
- Apply institution and period filters, check the exact preview, then
  download CSV if needed.
- If demonstrating data intake, go to `/data-explorer`, choose a
  synthetic-only CSV, confirm its synthetic nature, preview the column
  mapping and row validation, and commit only after reviewing the preview.
- Revisit Overview/Analytics after an accepted import to see the resulting
  persisted training records.

The current report page is a filtered report preview and CSV download, not a
full template designer. Saved templates, PDF output, and distribution are
not promised. Imports are persisted synthetic data, so preview carefully and
never use real, confidential, or personal records.

**User question answered:** “Can I take away a bounded report or inspect how
synthetic report data is validated?”

### 7. Check the system boundary and finish

- Open `/system-health` and refresh the probes. Distinguish connected local
  services from unavailable or unconfigured services.
- Open `/settings` to see the read-only demo session and configuration
  presence without exposing secret values.
- Return to Overview for a final portfolio summary, then log out.

**User question answered:** “What did this prototype actually verify, and
what is not connected or production-ready?”

## Journey branches and cross-page handoffs

```text
/login
  └─ sign in → /
       ├─ portfolio card → /institutions
       │    └─ institution → /institutions/[institutionId]
       │         ├─ report/source IDs → /reports?institutionId=…&period=…
       │         ├─ indicators → /analytics?institutionId=…&period=…
       │         └─ related signal → /exceptions
       ├─ open-signal card → /exceptions?period=…
       │    ├─ institution → /institutions/[institutionId]
       │    ├─ source report → /reports?institutionId=…&period=…
       │    └─ signal detail → /exceptions/[exceptionId] (navigation gap)
       ├─ indicator card → /analytics?period=…
       ├─ report card → /reports?period=…
       ├─ question → /assistant → cited source pages
       └─ final checks → /system-health → /settings → Logout

/data-explorer
  ├─ report search → filtered report preview
  ├─ completed document → /documents/[documentId]?chunk=…
  └─ synthetic CSV → preview → confirmed import → refreshed dashboard

/search (supporting route)
  ├─ document result → /documents/[documentId]?chunk=…
  ├─ institution result → /institutions/[institutionId]
  ├─ report result → /reports?period=…
  └─ signal result → filtered /exceptions
```

## Page states and user expectations

Every step should preserve a clear distinction between:

- **Loading:** the page is fetching or computing a result.
- **Empty:** a valid query completed and found no matching records.
- **Unavailable/error:** a required database, storage, or model service failed.
- **Stale/limited:** the value or history has a known limitation, which is
  disclosed next to the result.
- **Synthetic/illustrative:** all figures and boundaries in this demo are
  training values, not official findings.

The user must be able to return to a previous page without losing the
important institution/period context where the route supports it. Filters
should be bounded and validated. A report export must match the preview
filters. Assistant answers must expose the period, scope, and supporting
facts. Uploaded source text must be treated as untrusted content.

## Current gaps to resolve before calling the journey complete

1. **Exception detail navigation and mutation boundary:** add a clear signal
   link from the register if the detail page is part of the demo, and reconcile
   the rendered status-update form/API with the canonical public read-only
   product boundary. Until then, the register-to-detail/review-action flow is
   not a verified end-to-end path.
2. **Search discoverability:** `/search` works as a supporting route, but it
   is not currently a sidebar destination. Add an intentional entry point or
   make the indirect assistant/citation entry point explicit in the UI.
3. **Report scope:** label `/reports` as filtered preview plus CSV, not as the
   planned configurable template builder. Saved templates, PDF export, and
   dispatch remain out of scope.
4. **External integrations:** describe Java/Python and external supervisory
   connections as examples or unavailable unless a real integration has been
   configured and verified.
5. **Production readiness:** demo sign-in, synthetic roles, configured
   services, and local health probes do not establish production identity,
   authorization, audit, data protection, or operational readiness.

## Definition of a successful prototype walkthrough

- The user can reach every page in the navigation map without guessing a URL,
  or a supporting route is clearly identified as a secondary path.
- The investigation can move from portfolio → institution → indicator or
  review signal → source report/evidence → assistant answer → report/data
  output → health/settings → logout.
- Each returned value has an identifiable period and data source where
  available.
- Empty data is distinguishable from unavailable data.
- Every import, export, assistant action, or review operation communicates
  what it changes or sends and asks for confirmation where required.
- No screen implies access to official Bank systems, official policy,
  confidential records, persistent production workflows, or verified
  external integrations that the prototype does not have.

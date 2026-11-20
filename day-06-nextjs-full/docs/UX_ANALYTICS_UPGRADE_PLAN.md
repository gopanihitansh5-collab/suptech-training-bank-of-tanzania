# UX, Analytics and Query Upgrade Plan

## Objective

Make the dashboard feel like a polished, modern analyst workspace: instant filters,
coloured KPI cards, interactive charts and connected workflow nodes, clear row
selection, and answers that are generated from live database results rather than
reused template text. Keep the existing visual identity and layout structure.

## Requirements

### R1. Instant filters

- Selecting a reporting period, indicator, institution, status or severity updates
  the page immediately.
- No `Apply` button is required for dropdown filters.
- The URL remains shareable and back/forward navigation restores the same view.
- A subtle loading state shows while the next result set is being fetched.

### R2. Focused analytics

- The analytics page must not render the full indicator catalogue by default.
- Default view shows a small set of headline KPIs (deposits, loans, capital
  adequacy, NPL ratio, liquidity).
- Selecting an indicator narrows the KPI grid and trend chart to that indicator.
- The "all indicators" view is opt-in, not the default.

### R3. Coloured KPI cards

- KPI cards use distinct accent colours and soft gradients.
- Each card has a coloured top rule, icon or marker, and readable contrast.
- Colours are semantic where possible: teal for growth, blue for volume, amber for
  attention, rose for risk, violet for quality.
- Hover and focus states feel tactile without changing the overall theme.

### R4. Interactive charts

- Line/area charts show active points, rich tooltips and optional zoom/brush.
- Clicking a data point can drill into the matching period or institution.
- Charts support keyboard focus and reduced-motion preferences.
- Empty and single-point states are explicit and useful.

### R5. Connected workflow nodes

- Replace the static five-box workflow strip with an interactive node graph.
- Nodes are connected by animated edges that show direction.
- Hovering or selecting a node highlights its upstream/downstream connections and
  shows a detail panel with status, inputs and outputs.
- Active, completed, warning and skipped states are visually distinct.
- The graph remains usable on mobile and with a keyboard.

### R6. Row selection

- Clicking a table row selects it and applies a gradient highlight.
- Only one row is selected at a time unless a multi-select mode is enabled.
- Keyboard focus uses the same visual treatment.
- Selected-row detail can be surfaced in a side panel or inline expander.

### R7. Excel-like table controls

- Column sorting, sticky headers, row selection, copy, export CSV and column
  visibility are available on high-value tables.
- Filters and sorting are reflected in the URL.
- Large tables paginate or virtualise.

### R8. No templated answers

- Every answer is composed from the current query result and the user's question.
- Numbers, periods, institution names and citations must come from the result set.
- The composer must reject or repair answers that introduce numbers not present in
  the evidence.
- If the AI service is unavailable, the fallback must still be assembled from the
  returned records and clearly labelled as a data summary, not a canned answer.

### R9. Prompt-to-query engine

- A user prompt can produce a new read-only query without a developer adding a new
  tool for every question.
- The engine supports database records, the document knowledge base, and combined
  answers that use both.
- The AI service may propose a query specification, but the server compiles and
  validates it against an allowlist of tables, columns, joins and operators.
- Raw SQL is never executed directly from model output.
- Every query is parameterised, read-only, row-limited and audited.
- The response includes the rows, the generated query specification, a chart
  recommendation and a grounded narrative.

### R10. End-to-end uniqueness

- Remove hard-coded example answers from user-facing flows.
- Remove seeded-sounding phrases from generated summaries.
- Each answer must reflect the exact filters, row counts and values returned.
- Empty results, partial results and single-row results each get distinct wording.

## Current gaps found

- `analytics/page.tsx` uses a server-rendered form with an `Apply` button.
- `getAnalytics` returns every indicator when no indicator is selected.
- KPI cards share one visual treatment.
- Workflow visualisation is a static five-column grid.
- Tables only have a hover background; there is no selected-row treatment.
- Assistant and workflow narratives are assembled from fixed sentence templates.
- The assistant planner maps questions to a fixed set of tools; it does not compile
  new queries from arbitrary prompts.

## Architecture decisions

1. **URL-first filter state.** Client filter components call `router.replace` with
   `useTransition`, so the server page re-renders with new data and the URL stays
   authoritative.
2. **Query specification, not raw SQL.** The model returns JSON such as
   `{ dataset, fields, filters, groupBy, orderBy, limit }`. A server-side compiler
   maps it to parameterised SQL. This keeps the prompt-to-query feature powerful
   without giving the model write access or unchecked SQL.
3. **Evidence-bound composition.** The model receives only the returned rows and
   citations. A validator checks every numeric token in the draft against the
   evidence packet before the answer is shown.
4. **Progressive enhancement.** New interactions are client components layered on
   top of existing server pages; data loading and authorization stay on the server.
5. **One visual language.** New components reuse the existing CSS variables,
   spacing, radii and typography. Only accents, motion and depth are added.

## Phased plan

### Phase 1 — Instant analytics and KPI polish

- [ ] Add a client `AnalyticsFilters` component that updates on `change`.
- [ ] Keep period and indicator in the URL; preserve other query parameters.
- [ ] Show a loading shimmer while the transition is pending.
- [ ] Add a headline KPI set and make "all indicators" opt-in.
- [ ] Add semantic tone classes to KPI cards.
- [ ] Add gradient accents, hover lift and focus rings.
- [ ] Add a focused indicator trend chart.
- [ ] Add tests for filter URL building and default indicator selection.

### Phase 2 — Tables and row interaction

- [ ] Add a reusable `SelectableTable` client wrapper using event delegation.
- [ ] Apply selected-row gradient and keyboard focus styling.
- [ ] Add a detail drawer for the selected row.
- [ ] Add sortable headers and URL-backed sort state.
- [ ] Add copy and CSV export actions.
- [ ] Add sticky headers and pagination controls.

### Phase 3 — Interactive charts and workflow graph

- [ ] Add active dots, brush/zoom and click-to-filter to portfolio charts.
- [ ] Add reference lines for training thresholds.
- [ ] Build `WorkflowNodeGraph` with SVG edges and HTML nodes.
- [ ] Animate edge flow and node pulse; respect reduced motion.
- [ ] Add node detail panel with status, inputs and outputs.
- [ ] Add keyboard navigation and mobile layout.
- [ ] Add snapshot or interaction tests for node state mapping.

### Phase 4 — Prompt-to-query engine

- [ ] Define allowlisted datasets, columns and join paths.
- [ ] Define the query-spec JSON schema.
- [ ] Add a model prompt that returns a query spec plus a short rationale.
- [ ] Add a deterministic compiler from spec to parameterised SQL.
- [ ] Add validation for identifiers, operators, limits and joins.
- [ ] Add read-only transaction enforcement and statement timeout.
- [ ] Add audit logging for generated queries.
- [ ] Add a combined route that can query the database, search the knowledge base,
  or do both.
- [ ] Add result tables, chart recommendations and a grounded narrative.
- [ ] Add tests for invalid specs, injection attempts and empty results.

### Phase 5 — Evidence-bound narrative

- [ ] Build an evidence packet from rows, aggregates and citations.
- [ ] Add a composer prompt that must answer only from the packet.
- [ ] Validate numeric tokens and citation references.
- [ ] Repair or reject drafts that fail validation.
- [ ] Add a data-only fallback summary that is still generated from the result.
- [ ] Remove remaining fixed narrative strings from user-facing flows.
- [ ] Add regression tests for hallucinated numbers and stale periods.

## Acceptance criteria

- Changing a dropdown updates the data without pressing `Apply`.
- The analytics page opens with five headline KPIs, not the full catalogue.
- KPI cards are visually distinct and accessible.
- Workflow nodes respond to hover, click and keyboard input.
- Selected table rows use a gradient highlight and show details.
- Charts expose tooltips, active points and a drill-down action.
- A free-form prompt can return live database rows and a narrative that cites them.
- No answer contains a number, period or institution that is absent from the
  returned evidence.
- All new interactions pass typecheck, lint and the existing test suite.

## Risks and mitigations

- **Prompt-to-query safety.** Compile from a spec; never execute model SQL. Use a
  read-only role, allowlists, limits and timeouts.
- **Latency.** Show optimistic loading states; cache repeated queries; keep result
  sets small.
- **Narrative hallucination.** Validate numbers and citations against the evidence
  packet before rendering.
- **Visual drift.** Reuse existing tokens and avoid a full theme rewrite.
- **Accessibility.** Maintain focus order, contrast, reduced-motion support and
  keyboard equivalents for pointer interactions.

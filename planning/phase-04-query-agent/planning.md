# Phase 4 — Query planner and read-only executor

## Goal

Provide a professional, mock-first supervisory assistant that interprets
questions, retrieves only approved synthetic read-model data and explains
evidence without unrestricted chatbot or SQL behavior.

## Tasks

- Build a chat workspace with current-session conversation history, natural
  language input, suggested questions and institution/period context.
- Present intent, period/institution filters, API operation, dataset and
  expected result before execution.
- Require the user's explicit confirmation to run each plan.
- Support approved questions such as ranking institutions by exception count,
  explaining a specific exception, comparing institutions, and describing
  indicator trends.
- Execute through a FastAPI assistant endpoint and typed, allowlisted,
  parameterized read-only operations for summary, institutions, indicators,
  exceptions and report previews.
- Validate identifiers, periods, limits, filters, result shapes and numeric
  calculations before presenting results.
- Return structured answers with tables/charts when useful, calculation
  explanations, source identifiers, dataset and reporting-period citations,
  missing-data notes and suggested follow-up questions.
- Support streaming only if the selected provider/runtime can be tested
  reliably; provide clear loading and error states otherwise.
- Allow report preview/export actions only through the report registry and
  after explicit user confirmation.
- Keep model integration optional and server-configured; the prototype works
  without a provider key and never asks the user for a token.
- Treat prompts and model-produced plans as untrusted input.
- Do not execute arbitrary SQL or mutate data; a future real model must use
  the same validated executor.
- Log only non-sensitive query metadata where a durable audit store exists;
  do not log raw credentials or unsupported personal data.

## Acceptance criteria

- Tests cover ranking, explanation, missing parameters, invalid filters,
  denied write/arbitrary-SQL requests, API/provider errors and explicit
  execution.
- A query is not executed merely because a plan was generated.
- Every answer cites its dataset and reporting period, explains calculations
  and does not invent figures when evidence is missing.
- The mock planner does not claim that a real language model generated a plan.
- Any enabled model uses the same validated query registry; it cannot issue
  arbitrary SQL or public write operations.
- Conversation history is session-only unless a future privacy and retention
  design is approved.

## Status

Partial MVP implemented and typecheck/test/build verified: the deterministic
planner supports overview, exception list, institution lookup/search and
indicator analytics; the UI presents the plan, requires explicit confirmation
and displays structured evidence. Ranking, institution comparison, exception
explanation, document-grounded responses, complete citation/calculation
explanations and broader acceptance coverage remain incomplete.

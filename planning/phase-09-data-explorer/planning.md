# Phase 9 — Data explorer and data quality

## Goal

Make the synthetic data pipeline inspectable from source through validation
and analytics without exposing or modifying submitted data.

## Tasks

- List available synthetic datasets with descriptions, grains and row counts.
- Show schema/column information and validation or processing status.
- Summarize missing values, duplicates, invalid rows and validation findings.
- Distinguish raw, validated, rejected, curated and analytical layers.
- Provide bounded sample previews with row/source references and clear
  synthetic-data labels.
- Show ingestion run history only from data the backend actually records.
- Provide explicit unavailable states for metadata or history not yet stored.
- Keep all routes read-only and use server-side pagination/limits.

## Acceptance criteria

- Every displayed count is returned by a backend contract or is clearly
  computed from the selected bounded sample.
- The interface distinguishes raw, valid, rejected and analytical data.
- A finding can be followed to its rule and source row where available.
- Preview endpoints do not modify input files or expose unbounded datasets.
- Empty history is not represented as a successful ingestion.

## Dependencies

- Depends on Day 1 validation outputs and Phase 2 limits.
- Job history beyond the current manifest requires a separately approved,
  durable store and remains out of scope until then.

## Status

Partially implemented: persisted dataset counts, table/schema disclosures,
report search, bounded pagination, source links and explicit unavailable
states are present. Validation findings, raw/rejected layers, sample previews
and durable ingestion history are not implemented.

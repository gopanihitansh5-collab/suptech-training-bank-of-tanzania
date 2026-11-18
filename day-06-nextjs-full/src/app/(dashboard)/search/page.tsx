import Link from 'next/link';
import { RequestValidationError } from '@/lib/api-errors';
import { searchAll, type SearchHit } from '@/lib/search';
import { SearchForm } from '@/components/search-form';

type SearchParams = Promise<{
  q?: string | string[];
}>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function hitHref(hit: SearchHit): string {
  if (hit.kind === 'document') return '/uploads';
  if (hit.kind === 'report') {
    return hit.citation.period
      ? `/reports?period=${encodeURIComponent(hit.citation.period)}`
      : '/reports';
  }
  return hit.citation.institutionId
    ? `/institutions/${encodeURIComponent(hit.citation.institutionId)}`
    : '/institutions';
}

function hitLinkLabel(hit: SearchHit): string {
  if (hit.kind === 'document') return 'Ingestion';
  if (hit.kind === 'report') return 'View reports';
  return 'View institution';
}

function citationChips(hit: SearchHit): string[] {
  const chips: string[] = [];
  if (hit.kind === 'document') {
    chips.push(`source: ${hit.title}`);
    if (hit.citation.chunkIndex !== undefined) {
      chips.push(`chunk #${hit.citation.chunkIndex}`);
    }
    if (hit.citation.documentId) chips.push(`document ${hit.citation.documentId}`);
    return chips;
  }
  if (hit.kind === 'report') {
    if (hit.citation.reportId) chips.push(`report ${hit.citation.reportId}`);
    if (hit.citation.institutionId) {
      chips.push(`institution ${hit.citation.institutionId}`);
    }
    if (hit.citation.period) chips.push(`period ${hit.citation.period}`);
    return chips;
  }
  if (hit.citation.institutionId) {
    chips.push(`institution ${hit.citation.institutionId}`);
  }
  return chips;
}

function ResultGroup({
  title,
  caption,
  hits,
  emptyMessage,
}: {
  title: string;
  caption: string;
  hits: SearchHit[];
  emptyMessage: string;
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">{title}</h2>
          <p className="panel-caption">{caption}</p>
        </div>
        <span className="period-chip">{hits.length}</span>
      </div>
      {hits.length ? (
        <div className="panel-body" style={{ display: 'grid', gap: 14 }}>
          {hits.map((hit) => (
            <article
              key={`${hit.kind}-${hit.id}`}
              style={{ borderBottom: '1px solid var(--line)', paddingBottom: 14 }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <strong>{hit.title}</strong>
                <Link className="table-link" href={hitHref(hit)}>
                  {hitLinkLabel(hit)}
                </Link>
              </div>
              <p style={{ margin: '6px 0 8px', color: 'var(--muted)', lineHeight: 1.55 }}>
                {hit.excerpt}
              </p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {citationChips(hit).map((chip) => (
                  <span className="period-chip mono" key={chip}>{chip}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state" role="status">{emptyMessage}</div>
      )}
    </section>
  );
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const requestedQuery = (first(params.q) ?? '').trim();
  const hasQuery = requestedQuery.length > 0;
  let hits: SearchHit[] = [];
  let validationError: string | null = null;

  if (requestedQuery.length >= 2) {
    try {
      hits = await searchAll(requestedQuery);
    } catch (error) {
      if (error instanceof RequestValidationError) {
        validationError = error.message;
      } else {
        throw error;
      }
    }
  }

  const documentHits = hits.filter((hit) => hit.kind === 'document');
  const reportHits = hits.filter((hit) => hit.kind === 'report');
  const institutionHits = hits.filter((hit) => hit.kind === 'institution');

  return (
    <main className="page-content">
      <div className="synthetic-banner">
        <span aria-hidden="true">ⓘ</span>
        <div>
          <strong>Synthetic training corpus only.</strong> Results are keyword
          matches over fictional documents, reports and institutions. They are
          not official findings, and this page does not generate model-written
          answers.
        </div>
      </div>

      <section className="page-heading">
        <div>
          <div className="eyebrow">Evidence retrieval</div>
          <h1>Search</h1>
          <p className="subtitle">
            Find cited synthetic documents, monthly reports and institution records.
          </p>
        </div>
        <span className="period-chip">
          {hasQuery ? `${hits.length} result(s)` : 'Keyword search'}
        </span>
      </section>

      <div style={{ display: 'grid', gap: 16 }}>
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Search the training corpus</h2>
              <p className="panel-caption">
                Enter 2–200 characters. Document hits require completed TXT/CSV ingestion.
              </p>
            </div>
          </div>
          <div className="panel-body">
            <SearchForm key={requestedQuery} initialQuery={requestedQuery} />
          </div>
        </section>

        {validationError ? (
          <section className="panel">
            <div className="panel-body">
              <div className="form-error" role="alert">{validationError}</div>
            </div>
          </section>
        ) : null}

        {!hasQuery ? (
          <section className="panel">
            <div className="empty-state" role="status">
              Enter a phrase, institution, region or reporting period to search the
              synthetic corpus. Results cite their source document chunk, report or
              institution record.
            </div>
          </section>
        ) : null}

        {hasQuery && requestedQuery.length < 2 ? (
          <section className="panel">
            <div className="empty-state" role="status">
              Enter at least 2 characters to search.
            </div>
          </section>
        ) : null}

        {requestedQuery.length >= 2 && !validationError ? (
          <>
            <ResultGroup
              title="Documents"
              caption="Completed ingestion chunks ranked by full-text relevance."
              hits={documentHits}
              emptyMessage="No ingested document chunks matched. Document search only covers completed TXT/CSV uploads; no documents are ingestable yet until the upload workflow is available."
            />
            <ResultGroup
              title="Reports"
              caption="Monthly reports matched by institution name, region or reporting-period prefix."
              hits={reportHits}
              emptyMessage="No synthetic monthly reports matched this query."
            />
            <ResultGroup
              title="Institutions"
              caption="Synthetic institution register matches by name, region or type."
              hits={institutionHits}
              emptyMessage="No synthetic institutions matched this query."
            />
          </>
        ) : null}
      </div>
    </main>
  );
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NotFoundError, RequestValidationError } from '@/lib/api-errors';
import { getDocumentChunkDetail } from '@/lib/document-source';

type Params = Promise<{ documentId: string }>;
type SearchParams = Promise<{ chunk?: string | string[] }>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DocumentSourcePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const [{ documentId }, search] = await Promise.all([params, searchParams]);
  const rawChunkIndex = first(search.chunk) ?? '0';
  const chunkIndex = Number(rawChunkIndex);
  let detail;
  try {
    detail = await getDocumentChunkDetail(documentId, chunkIndex);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof RequestValidationError) {
      notFound();
    }
    throw error;
  }

  return (
    <main className="page-content">
      <Link className="back-link" href="/search">Back to search</Link>
      <div className="synthetic-banner">
        <span aria-hidden="true">ⓘ</span>
        <div>
          <strong>Untrusted synthetic source text.</strong> Review this excerpt
          in context. Uploaded text is not independently verified evidence.
        </div>
      </div>
      <section className="page-heading">
        <div>
          <div className="eyebrow">Search citation · chunk {detail.chunkIndex}</div>
          <h1>{detail.filename}</h1>
          <p className="subtitle">Source chunk from the local synthetic training corpus.</p>
        </div>
        <span className="period-chip">{detail.status}</span>
      </section>
      <section className="detail-grid document-source-meta">
        <div className="detail-stat"><span>Document ID</span><strong className="mono document-meta-value">{detail.documentId}</strong></div>
        <div className="detail-stat"><span>Content type</span><strong>{detail.contentType}</strong></div>
        <div className="detail-stat"><span>Size</span><strong>{detail.byteSize.toLocaleString('en')} bytes</strong></div>
        <div className="detail-stat"><span>Reporting period</span><strong>{detail.reportingPeriod ?? 'Not specified'}</strong></div>
        <div className="detail-stat"><span>Institution</span><strong>{detail.institutionName ?? 'Not linked'}</strong></div>
        <div className="detail-stat"><span>Institution ID</span><strong className="mono">{detail.institutionId ?? '—'}</strong></div>
      </section>
      <section className="panel document-source-content">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Source text</h2>
            <p className="panel-caption">
              {detail.contentTruncated
                ? 'Preview limited to 4,000 characters.'
                : 'Showing the complete indexed chunk.'}
            </p>
          </div>
        </div>
        <pre className="source-chunk">{detail.content}</pre>
      </section>
      <section className="panel document-source-reference">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Source reference</h2>
            <p className="panel-caption">Row or chunk provenance recorded during ingestion.</p>
          </div>
        </div>
        <pre className="source-reference">
          {JSON.stringify(detail.sourceReference, null, 2)}
        </pre>
      </section>
    </main>
  );
}

import Link from 'next/link';
import { RequestValidationError } from '@/lib/api-errors';
import { listExceptions } from '@/lib/repository';
import { SelectableTable } from '@/components/selectable-table';

type SearchParams = Promise<{
  search?: string | string[];
  institutionId?: string | string[];
  period?: string | string[];
  severity?: string | string[];
  status?: string | string[];
  page?: string | string[];
}>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function pageHref(filters: Record<string, string>, page: number): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  params.set('page', String(page));
  return `/exceptions?${params}`;
}

export default async function ExceptionsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const filters = {
    search: first(params.search)?.trim() ?? '',
    institutionId: first(params.institutionId)?.trim() ?? '',
    period: first(params.period) ?? '',
    severity: first(params.severity) ?? '',
    status: first(params.status) ?? 'open',
  };
  const page = first(params.page) ? Number(first(params.page)) : 1;
  let result;
  try {
    result = await listExceptions({
      ...filters,
      severity: filters.severity || undefined,
      status: filters.status === 'all' ? undefined : filters.status,
      page,
      pageSize: 25,
    });
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return <FilterError message={error.message} />;
    }
    throw error;
  }

  return (
    <main className="page-content">
      <div className="synthetic-banner">
        <span aria-hidden="true">ⓘ</span>
        <div>
          <strong>Illustrative review signals.</strong> These synthetic
          threshold comparisons are for training and are not official findings
          or proof of non-compliance.
        </div>
      </div>
      <section className="page-heading">
        <div>
          <div className="eyebrow">Review workspace</div>
          <h1>Exceptions &amp; alerts</h1>
          <p className="subtitle">Filter threshold signals and trace each record to its synthetic institution and report.</p>
        </div>
        <span className="period-chip">{result.total} matching signal(s)</span>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Exception register</h2>
            <p className="panel-caption">Filters are applied on the server with bounded pagination.</p>
          </div>
        </div>
        <form className="exception-filters" method="get" action="/exceptions">
          <label>
            Search
            <input name="search" defaultValue={filters.search} maxLength={100} placeholder="ID, institution or signal" />
          </label>
          <label>
            Institution ID
            <input name="institutionId" defaultValue={filters.institutionId} maxLength={24} placeholder="e.g. TZ004" />
          </label>
          <label>
            Period
            <input name="period" type="month" defaultValue={filters.period} />
          </label>
          <label>
            Severity
            <select name="severity" defaultValue={filters.severity}>
              <option value="">All severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
          <label>
            Status
            <select name="status" defaultValue={filters.status}>
              <option value="open">Open</option>
              <option value="under_review">Under review</option>
              <option value="resolved">Resolved</option>
              <option value="all">All statuses</option>
            </select>
          </label>
          <div className="filter-actions">
            <button className="button-primary" type="submit">Apply filters</button>
            <Link href="/exceptions">Reset</Link>
          </div>
        </form>

        {result.items.length ? (
          <SelectableTable>
            <table>
              <thead>
                <tr>
                  <th>Period</th><th>Institution</th><th>Signal</th><th>Observed</th>
                  <th>Training threshold</th><th>Severity</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((exception) => (
                  <tr key={exception.id}>
                    <td className="mono">{exception.period}</td>
                    <td>
                      <Link className="table-link institution-name" href={`/institutions/${encodeURIComponent(exception.institutionId)}`}>
                        {exception.institutionName}
                      </Link>
                      <div className="mono" style={{ marginTop: 4, color: '#758197', fontSize: 10 }}>{exception.institutionId}</div>
                    </td>
                    <td>{exception.message}</td>
                    <td className="mono">{exception.observedValue}</td>
                    <td className="mono">{exception.thresholdValue}</td>
                    <td><span className={`severity-pill severity-${exception.severity}`}>{exception.severity}</span></td>
                    <td>{exception.status.replace('_', ' ')}</td>
                    <td className="mono">{exception.reportId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SelectableTable>
        ) : (
          <div className="empty-state" role="status">No signals match these filters.</div>
        )}

        <div className="pagination">
          <span>Page {result.page} of {Math.max(result.totalPages, 1)} · {result.total} results</span>
          <div className="pagination-links">
            {result.page > 1 ? (
              <Link href={pageHref(filters, result.page - 1)}>Previous</Link>
            ) : <span className="disabled" aria-disabled="true">Previous</span>}
            {result.page < result.totalPages ? (
              <Link href={pageHref(filters, result.page + 1)}>Next</Link>
            ) : <span className="disabled" aria-disabled="true">Next</span>}
          </div>
        </div>
      </section>
    </main>
  );
}

function FilterError({ message }: { message: string }) {
  return (
    <main className="page-content">
      <section className="error-panel" role="alert">
        <div className="eyebrow">Invalid filter</div>
        <h1>Exceptions could not be filtered</h1>
        <p>{message}</p>
        <Link className="table-link" href="/exceptions">Reset filters</Link>
      </section>
    </main>
  );
}

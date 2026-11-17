import Link from 'next/link';
import { listInstitutions } from '@/lib/repository';

type SearchParams = Promise<{
  search?: string | string[];
  page?: string | string[];
}>;

export default async function InstitutionsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const searchValue = Array.isArray(params.search) ? params.search[0] : params.search;
  const pageValue = Array.isArray(params.page) ? params.page[0] : params.page;
  const search = searchValue?.trim() ?? '';
  const page = pageValue ? Number(pageValue) : 1;
  const result = await listInstitutions({ search, page, pageSize: 25 });

  return (
    <main className="page-content">
      <div className="synthetic-banner">
        <span aria-hidden="true">ⓘ</span>
        <div><strong>Fictional register.</strong> Search results use deterministic synthetic training institutions only.</div>
      </div>
      <section className="page-heading">
        <div>
          <div className="eyebrow">Supervisory console</div>
          <h1>Financial institutions</h1>
          <p className="subtitle">Search the synthetic register and open an institution’s source-linked reporting history.</p>
        </div>
        <span className="period-chip">{result.total} synthetic entities</span>
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Institution directory</h2>
            <p className="panel-caption">Filter by name or fictional identifier.</p>
          </div>
          <form className="search-form" method="get" role="search">
            <label className="sr-only" htmlFor="institution-search">Search institutions</label>
            <input
              className="search-input"
              id="institution-search"
              name="search"
              placeholder="Name or identifier"
              defaultValue={search}
            />
            <button className="button-primary" type="submit">Search</button>
          </form>
        </div>
        {result.items.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Institution</th><th>Type</th><th>Region</th><th>Tier</th>
                  <th>Latest period</th><th>Deposits (TZS bn)</th><th>Open signals</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((institution) => (
                  <tr key={institution.institutionId}>
                    <td>
                      <Link className="table-link institution-name" href={`/institutions/${encodeURIComponent(institution.institutionId)}`}>
                        {institution.name}
                      </Link>
                      <div className="mono" style={{ marginTop: 4, color: '#758197', fontSize: 10 }}>{institution.institutionId}</div>
                    </td>
                    <td>{institution.type}</td>
                    <td>{institution.region}</td>
                    <td>{institution.tier}</td>
                    <td className="mono">{institution.latestPeriod ?? '—'}</td>
                    <td>{institution.depositsTzsBillions === null ? '—' : institution.depositsTzsBillions.toFixed(1)}</td>
                    <td>{institution.openExceptions}</td>
                    <td><span className="status-pill">{institution.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty-state">No institutions matched “{search}”. Try a different name or identifier.</div>}
        <div className="pagination">
          <span>Page {result.page} of {Math.max(result.totalPages, 1)} · {result.total} results</span>
          <div className="pagination-links">
            {result.page > 1 ? (
              <Link href={`/institutions?${new URLSearchParams({ ...(search ? { search } : {}), page: String(result.page - 1) })}`}>
                Previous
              </Link>
            ) : <span className="disabled" aria-disabled="true">Previous</span>}
            {result.page < result.totalPages ? (
              <Link href={`/institutions?${new URLSearchParams({ ...(search ? { search } : {}), page: String(result.page + 1) })}`}>
                Next
              </Link>
            ) : <span className="disabled" aria-disabled="true">Next</span>}
          </div>
        </div>
      </section>
    </main>
  );
}

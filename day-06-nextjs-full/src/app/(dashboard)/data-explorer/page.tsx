import { RequestValidationError } from '@/lib/api-errors';
import { listReports } from '@/lib/repository';
import { ReportTable } from '@/components/report-table';

type SearchParams = Promise<{
  search?: string | string[];
  period?: string | string[];
  page?: string | string[];
}>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DataExplorerPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const filters = {
    search: first(params.search)?.trim() ?? '',
    period: first(params.period) ?? '',
  };
  const requestedPage = first(params.page);
  const page = requestedPage ? Number(requestedPage) : 1;
  let result;
  try {
    result = await listReports({ ...filters, page, pageSize: 25 });
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
          <strong>Read-only synthetic data explorer.</strong> Document upload,
          ingestion jobs and validation diagnostics are not implemented yet.
        </div>
      </div>
      <section className="page-heading">
        <div>
          <div className="eyebrow">Report inventory</div>
          <h1>Data Explorer</h1>
          <p className="subtitle">Search persisted reports and follow their institution history.</p>
        </div>
        <span className="period-chip">{result.total} report(s)</span>
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Submitted training reports</h2>
            <p className="panel-caption">Search by report ID or institution name/identifier.</p>
          </div>
        </div>
        <form className="filter-form report-filters" method="get" action="/data-explorer">
          <label>
            Search reports
            <input name="search" maxLength={100} defaultValue={filters.search} placeholder="Report ID or institution" />
          </label>
          <label>
            Reporting period
            <input name="period" type="month" defaultValue={filters.period} />
          </label>
          <button className="button-primary" type="submit">Search</button>
        </form>
        <ReportTable result={result} filters={filters} />
      </section>
    </main>
  );
}

function FilterError({ message }: { message: string }) {
  return (
    <main className="page-content">
      <section className="error-panel" role="alert">
        <div className="eyebrow">Invalid filter</div>
        <h1>Reports could not be filtered</h1>
        <p>{message}</p>
        <a className="table-link" href="/data-explorer">Reset filters</a>
      </section>
    </main>
  );
}

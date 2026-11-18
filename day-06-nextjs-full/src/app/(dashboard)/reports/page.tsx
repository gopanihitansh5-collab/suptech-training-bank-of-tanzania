import { RequestValidationError } from '@/lib/api-errors';
import { listReports } from '@/lib/repository';
import { ReportTable } from '@/components/report-table';

type SearchParams = Promise<{
  institutionId?: string | string[];
  period?: string | string[];
  page?: string | string[];
}>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const filters = {
    institutionId: first(params.institutionId)?.trim() ?? '',
    period: first(params.period) ?? '',
  };
  const exportParams = new URLSearchParams();
  if (filters.institutionId) exportParams.set('institutionId', filters.institutionId);
  if (filters.period) exportParams.set('period', filters.period);
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
          <strong>Synthetic report preview.</strong> Results come from the
          persisted training dataset. CSV export uses the selected filters and
          is limited to 1,000 records. Saved templates and dispatch are not
          available.
        </div>
      </div>
      <section className="page-heading">
        <div>
          <div className="eyebrow">Report workspace</div>
          <h1>Custom report preview</h1>
          <p className="subtitle">Filter submitted reports and preview their source records.</p>
        </div>
        <span className="period-chip">{result.total} matching report(s)</span>
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Preview filters</h2>
            <p className="panel-caption">Choose a period or institution, then apply to the persisted report set.</p>
          </div>
          <a
            className="button-primary button-link"
            href={`/api/reports/export${exportParams.size ? `?${exportParams}` : ''}`}
          >
            Download CSV
          </a>
        </div>
        <form className="filter-form report-filters" method="get" action="/reports">
          <label>
            Reporting period
            <input name="period" type="month" defaultValue={filters.period} />
          </label>
          <label>
            Institution ID
            <input name="institutionId" maxLength={24} defaultValue={filters.institutionId} placeholder="e.g. TZ004" />
          </label>
          <button className="button-primary" type="submit">Update preview</button>
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
        <h1>Report preview could not be filtered</h1>
        <p>{message}</p>
        <a className="table-link" href="/reports">Reset filters</a>
      </section>
    </main>
  );
}

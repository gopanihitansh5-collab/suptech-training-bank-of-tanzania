import { RequestValidationError } from '@/lib/api-errors';
import { getDataExplorerStats, listReports } from '@/lib/repository';
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
  const stats = await getDataExplorerStats();
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
          <strong>Read-only synthetic data explorer.</strong> Counts below come
          from persisted Day 6 tables. Row-level validation and ingestion-run
          history are not stored by this MVP.
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
      <section className="dataset-grid" aria-label="Persisted synthetic datasets">
        <DatasetCard
          name="Institutions"
          tableName="institutions"
          count={stats.institutions}
          grain="One row per fictional institution"
          layer="Reference"
          fields={['institution_id', 'institution_name', 'institution_type', 'region', 'tier', 'status']}
        />
        <DatasetCard
          name="Monthly reports"
          tableName="institution_reports"
          count={stats.reports}
          grain="One report per institution and reporting period"
          layer="Curated"
          fields={['report_id', 'institution_id', 'reporting_period', 'deposits_tzs_billions', 'loans_tzs_billions', 'report_completeness_percent', 'source_record_ids']}
        />
        <DatasetCard
          name="Supervisory indicators"
          tableName="supervisory_indicators"
          count={stats.indicators}
          grain="Institution or sector indicator by period"
          layer="Analytical"
          fields={['indicator_id', 'grain', 'reporting_period', 'subject_key', 'indicator_value', 'unit', 'formula', 'source_report_ids']}
        />
        <DatasetCard
          name="Review signals"
          tableName="supervisory_exceptions"
          count={stats.reviewSignals}
          grain="One illustrative threshold comparison"
          layer="Analytical"
          fields={['exception_id', 'report_id', 'institution_id', 'reporting_period', 'indicator_id', 'observed_value', 'threshold_value', 'severity', 'status']}
        />
      </section>
      <section className="panel data-quality-panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Validation and processing evidence</h2>
            <p className="panel-caption">Unavailable evidence is identified rather than shown as a successful empty run.</p>
          </div>
        </div>
        <dl className="data-quality-list">
          <div><dt>Latest persisted reporting period</dt><dd>{stats.latestPeriod ?? 'No report period available'}</dd></div>
          <div><dt>Missing, duplicate, or rejected row counts</dt><dd>Not recorded in Day 6</dd></div>
          <div><dt>Durable ingestion run history</dt><dd>Not available in this MVP</dd></div>
          <div><dt>Data boundary</dt><dd>Fictional training records only</dd></div>
        </dl>
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

function DatasetCard({
  name,
  tableName,
  count,
  grain,
  layer,
  fields,
}: {
  name: string;
  tableName: string;
  count: number;
  grain: string;
  layer: string;
  fields: string[];
}) {
  return (
    <article className="panel dataset-card">
      <div className="dataset-card-top">
        <div>
          <h2 className="panel-title">{name}</h2>
          <span className="dataset-layer">{layer} layer</span>
        </div>
        <strong className="dataset-count">{count.toLocaleString('en')}</strong>
      </div>
      <p className="panel-caption">{grain}</p>
      <details>
        <summary>View table and schema fields</summary>
        <p className="dataset-table-name mono">{tableName}</p>
        <ul className="dataset-fields">
          {fields.map((field) => <li className="mono" key={field}>{field}</li>)}
        </ul>
      </details>
    </article>
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

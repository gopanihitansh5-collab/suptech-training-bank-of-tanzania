import { getAnalytics } from '@/lib/repository';
import { INDICATOR_DEFINITIONS } from '@/lib/catalog';
import { RequestValidationError } from '@/lib/api-errors';
import { PortfolioChart } from '@/components/portfolio-chart';

type SearchParams = Promise<{
  period?: string | string[];
  indicator?: string | string[];
}>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const period = first(params.period);
  const indicator = first(params.indicator);
  let analytics;
  try {
    analytics = await getAnalytics(period, indicator);
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return <FilterError message={error.message} />;
    }
    throw error;
  }

  const chartData = analytics.trend.map((point) => ({
    period: point.period,
    depositsTzsBillions: point.deposits,
    loansTzsBillions: point.loans,
    completenessPercent: point.completeness,
    exceptions: 0,
  }));
  const numberFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });

  return (
    <main className="page-content">
      <div className="synthetic-banner">
        <span aria-hidden="true">ⓘ</span>
        <div>
          <strong>Training analytics only.</strong> Ratios and thresholds are
          calculated from synthetic records; they are not official policy or
          regulatory assessments.
        </div>
      </div>
      <section className="page-heading">
        <div>
          <div className="eyebrow">Portfolio monitoring</div>
          <h1>Supervisory analytics</h1>
          <p className="subtitle">
            Indicator formulas and historical portfolio values from persisted
            training reports.
          </p>
        </div>
        {analytics.period && <span className="period-chip">Period · {analytics.period}</span>}
      </section>

      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Analytics filters</h2>
            <p className="panel-caption">Choose a period or indicator from the seeded catalog.</p>
          </div>
          <form className="filter-form" method="get" action="/analytics">
            <label>
              Reporting period
              <select name="period" defaultValue={period ?? ''}>
                {analytics.trend.map((point) => (
                  <option key={point.period} value={point.period}>{point.period}</option>
                ))}
              </select>
            </label>
            <label>
              Indicator
              <select name="indicator" defaultValue={indicator ?? ''}>
                <option value="">All indicators</option>
                {INDICATOR_DEFINITIONS.map((definition) => (
                  <option key={definition.id} value={definition.id}>{definition.label}</option>
                ))}
              </select>
            </label>
            <button className="button-primary" type="submit">Apply</button>
          </form>
        </div>
      </section>

      {analytics.indicators.length ? (
        <section className="metric-grid" aria-label="Synthetic indicator values">
          {analytics.indicators.map((item) => (
            <article className="metric-card" key={item.id}>
              <div className="metric-label">{item.label}</div>
              <div className="metric-value">
                {item.value === null ? '—' : `${numberFormat.format(item.value)}${item.unit === '%' ? '%' : ''}`}
              </div>
              <div className="metric-foot">{item.unit} · training indicator</div>
              <div className="metric-formula">{item.formula}</div>
            </article>
          ))}
        </section>
      ) : (
        <div className="panel empty-state" role="status">
          No indicator data is available for this reporting period.
        </div>
      )}

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Reported portfolio trend</h2>
            <p className="panel-caption">Deposits and loans · TZS billions · monthly synthetic data</p>
          </div>
          <span className="period-chip">{analytics.trend.length} periods</span>
        </div>
        <div className="panel-body">
          <PortfolioChart data={chartData} />
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
        <h1>Analytics could not be filtered</h1>
        <p>{message}</p>
        <a className="table-link" href="/analytics">Reset filters</a>
      </section>
    </main>
  );
}

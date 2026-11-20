import { getAnalytics } from '@/lib/repository';
import { INDICATOR_DEFINITIONS } from '@/lib/catalog';
import { RequestValidationError } from '@/lib/api-errors';
import { PortfolioChart } from '@/components/portfolio-chart';
import { AnalyticsFilters } from '@/components/analytics-filters';
import { IndicatorTrendChart } from '@/components/indicator-trend-chart';

const HEADLINE_INDICATORS = ['deposits', 'loans', 'capital_adequacy', 'npl_ratio', 'liquidity'];

const INDICATOR_TONES: Record<string, string> = {
  deposits: 'teal',
  loans: 'blue',
  loan_to_deposit: 'violet',
  deposit_growth: 'teal',
  loan_growth: 'blue',
  capital_adequacy: 'violet',
  npl_ratio: 'rose',
  liquidity: 'amber',
  completeness: 'teal',
  quality_failure_rate: 'rose',
  late_submission: 'amber',
};

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
  const visibleIndicators = indicator
    ? analytics.indicators
    : analytics.indicators.filter((item) => HEADLINE_INDICATORS.includes(item.id));
  const selectedDefinition = indicator
    ? INDICATOR_DEFINITIONS.find((definition) => definition.id === indicator)
    : undefined;

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
            <p className="panel-caption">Change a filter and the page updates immediately.</p>
          </div>
          <AnalyticsFilters
            period={period}
            indicator={indicator}
            periods={analytics.trend.map((point) => point.period)}
            indicators={INDICATOR_DEFINITIONS.map((definition) => ({ id: definition.id, label: definition.label }))}
          />
        </div>
      </section>

      {visibleIndicators.length ? (
        <section className="metric-grid" aria-label="Synthetic indicator values">
          {visibleIndicators.map((item) => (
            <article className={`metric-card tone-${INDICATOR_TONES[item.id] ?? 'slate'}`} key={item.id}>
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

      {indicator && selectedDefinition ? (
        <section className="panel" style={{ marginTop: 16 }}>
          <div className="panel-header">
            <div>
              <h2 className="panel-title">{selectedDefinition.label} trend</h2>
              <p className="panel-caption">Historical values for the selected indicator · use the slider to zoom.</p>
            </div>
            <span className="period-chip">{(analytics.indicatorTrend ?? []).length} periods</span>
          </div>
          <div className="panel-body">
            <IndicatorTrendChart
              data={analytics.indicatorTrend ?? []}
              label={selectedDefinition.label}
              unit={selectedDefinition.unit}
            />
          </div>
        </section>
      ) : (
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
      )}
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

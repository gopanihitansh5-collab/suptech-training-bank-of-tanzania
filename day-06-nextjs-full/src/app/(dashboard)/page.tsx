import Link from 'next/link';
import { PortfolioChart, PortfolioQualityChart } from '@/components/portfolio-chart';
import { getOverview } from '@/lib/repository';
import { RequestValidationError } from '@/lib/api-errors';

const numberFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });
const moneyFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });

type SearchParams = Promise<{ period?: string | string[] }>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const requestedPeriod = first(params.period);
  let overview;
  try {
    overview = await getOverview(requestedPeriod);
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return <FilterError message={error.message} />;
    }
    throw error;
  }
  const { summary } = overview;
  const completionRate = summary.reportsExpected
    ? (summary.reportsReceived / summary.reportsExpected) * 100
    : 0;
  const periodQuery = overview.period
    ? `?${new URLSearchParams({ period: overview.period })}`
    : '';

  return (
    <main className="page-content">
      <div className="synthetic-banner">
        <span aria-hidden="true">ⓘ</span>
        <div>
          <strong>Synthetic training environment.</strong> All institutions,
          reports, metrics and review thresholds are fictional. This is not an
          official Bank of Tanzania system or regulatory determination.
        </div>
      </div>
      <section className="page-heading">
        <div>
          <div className="eyebrow">Executive overview</div>
          <h1>Supervisory monitoring</h1>
          <p className="subtitle">
            Persisted training indicators and review signals for{' '}
            {overview.period ?? 'the available reporting cycle'}.
          </p>
        </div>
        <div className="page-heading-actions">
          {overview.period && (
            <form className="filter-form compact-filter" method="get" action="/">
              <label>
                Reporting period
                <select name="period" defaultValue={overview.period}>
                  {overview.trend.map((point) => (
                    <option key={point.period} value={point.period}>{point.period}</option>
                  ))}
                </select>
              </label>
              <button className="button-primary" type="submit">Apply</button>
            </form>
          )}
          {overview.period && <span className="period-chip">Selected · {overview.period}</span>}
        </div>
      </section>

      <section className="metric-grid" aria-label="Portfolio summary">
        <MetricCard href="/institutions" label="Fictional institutions" value={numberFormat.format(summary.institutions)} foot="Open the synthetic register" />
        <MetricCard href={`/reports${periodQuery}`} label="Reports received" value={`${summary.reportsReceived} / ${summary.reportsExpected}`} foot={`${numberFormat.format(completionRate)}% of expected reports`} tone="teal" />
        <MetricCard href={`/exceptions${periodQuery}`} label="Open review signals" value={numberFormat.format(summary.openExceptions)} foot={`${summary.criticalExceptions} critical training signal(s)`} tone={summary.criticalExceptions ? 'amber' : 'teal'} />
        <MetricCard href={`/analytics${periodQuery}`} label="Deposits reported" value={`${moneyFormat.format(summary.depositsTzsBillions)} bn`} foot="TZS · view portfolio analytics" />
        <MetricCard href={`/analytics${periodQuery}`} label="Average completeness" value={summary.completenessPercent === null ? '—' : `${numberFormat.format(summary.completenessPercent)}%`} foot="Across submitted reports" />
      </section>

      {summary.reportsReceived === 0 && (
        <div className="empty-state panel" role="status">
          No reports exist for this reporting period. Choose a period with persisted data.
        </div>
      )}

      <div className="content-grid" style={{ marginTop: 16 }}>
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Portfolio trend</h2>
              <p className="panel-caption">Monthly synthetic deposits and loans · TZS billions</p>
            </div>
            <span className="period-chip">Synthetic records</span>
          </div>
          <div className="panel-body">
            <PortfolioChart data={overview.trend} />
            <h3 className="chart-subheading">Reporting quality and review signals</h3>
            <p className="panel-caption">Completeness uses a 0–100% axis; signal counts use the right axis.</p>
            <PortfolioQualityChart data={overview.trend} />
          </div>
        </section>
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Recent review signals</h2>
              <p className="panel-caption">Training indicators for human review, not findings</p>
            </div>
            <Link className="table-link" href="/institutions">Directory →</Link>
          </div>
          {overview.recentExceptions.length ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Institution</th><th>Signal</th><th>Severity</th></tr></thead>
                <tbody>
                  {overview.recentExceptions.map((exception) => (
                    <tr key={exception.id}>
                      <td>
                        <Link className="table-link" href={`/institutions/${encodeURIComponent(exception.institutionId)}`}>
                          {exception.institutionName}
                        </Link>
                      </td>
                      <td>{exception.message}</td>
                      <td><span className={`severity-pill severity-${exception.severity}`}>{exception.severity}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="empty-state">No open review signals for this period.</div>}
        </section>
      </div>
    </main>
  );
}

function MetricCard({
  href,
  label,
  value,
  foot,
  tone,
}: {
  href: string;
  label: string;
  value: string;
  foot: string;
  tone?: 'teal' | 'amber';
}) {
  return (
    <Link className="metric-card-link" href={href} aria-label={`${label}: ${value}. ${foot}`}>
      <article className="metric-card">
        <div className="metric-label">{label}</div>
        <div className="metric-value">{value}</div>
        <div className={`metric-foot${tone ? ` ${tone}` : ''}`}>{foot}</div>
      </article>
    </Link>
  );
}

function FilterError({ message }: { message: string }) {
  return (
    <main className="page-content">
      <section className="error-panel" role="alert">
        <div className="eyebrow">Invalid filter</div>
        <h1>Overview could not be filtered</h1>
        <p>{message}</p>
        <Link className="table-link" href="/">Reset period</Link>
      </section>
    </main>
  );
}

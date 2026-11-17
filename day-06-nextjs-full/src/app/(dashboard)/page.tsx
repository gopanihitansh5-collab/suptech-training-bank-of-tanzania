import Link from 'next/link';
import { PortfolioChart } from '@/components/portfolio-chart';
import { getOverview } from '@/lib/repository';

const numberFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });
const moneyFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });

export default async function OverviewPage() {
  const overview = await getOverview();
  const { summary } = overview;
  const completionRate = summary.reportsExpected
    ? (summary.reportsReceived / summary.reportsExpected) * 100
    : 0;

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
        {overview.period && <span className="period-chip">Reporting period · {overview.period}</span>}
      </section>

      <section className="metric-grid" aria-label="Portfolio summary">
        <MetricCard label="Fictional institutions" value={numberFormat.format(summary.institutions)} foot="Synthetic training register" />
        <MetricCard label="Reports received" value={`${summary.reportsReceived} / ${summary.reportsExpected}`} foot={`${numberFormat.format(completionRate)}% of expected reports`} tone="teal" />
        <MetricCard label="Open review signals" value={numberFormat.format(summary.openExceptions)} foot={`${summary.criticalExceptions} critical training signal(s)`} tone={summary.criticalExceptions ? 'amber' : 'teal'} />
        <MetricCard label="Deposits reported" value={`${moneyFormat.format(summary.depositsTzsBillions)} bn`} foot="TZS · synthetic amounts" />
        <MetricCard label="Average completeness" value={summary.completenessPercent === null ? '—' : `${numberFormat.format(summary.completenessPercent)}%`} foot="Across submitted reports" />
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
              <p className="panel-caption">Monthly deposits and loans · TZS billions</p>
            </div>
            <span className="period-chip">Synthetic records</span>
          </div>
          <div className="panel-body">
            <PortfolioChart data={overview.trend} />
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
  label,
  value,
  foot,
  tone,
}: {
  label: string;
  value: string;
  foot: string;
  tone?: 'teal' | 'amber';
}) {
  return (
    <article className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      <div className={`metric-foot${tone ? ` ${tone}` : ''}`}>{foot}</div>
    </article>
  );
}

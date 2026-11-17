import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NotFoundError, RequestValidationError } from '@/lib/api-errors';
import { getInstitutionDetail } from '@/lib/repository';

type Params = Promise<{ institutionId: string }>;

export default async function InstitutionDetailPage({ params }: { params: Params }) {
  const { institutionId } = await params;
  let detail;
  try {
    detail = await getInstitutionDetail(institutionId);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof RequestValidationError) notFound();
    throw error;
  }
  const { institution } = detail;

  return (
    <main className="page-content">
      <Link className="back-link" href="/institutions">← Institution directory</Link>
      <div className="synthetic-banner">
        <span aria-hidden="true">ⓘ</span>
        <div><strong>Synthetic institution profile.</strong> Values and signals are fictional training data, not official assessments.</div>
      </div>
      <section className="page-heading">
        <div>
          <div className="eyebrow">{institution.institutionId} · {institution.type}</div>
          <h1>{institution.name}</h1>
          <p className="subtitle">{institution.region} · {institution.tier} · {institution.status}</p>
        </div>
        <span className="period-chip">{institution.openExceptions} open review signal(s)</span>
      </section>
      <section className="detail-grid" aria-label="Latest synthetic indicators">
        <DetailStat label="Latest reporting period" value={institution.latestPeriod ?? 'No report'} />
        <DetailStat label="Deposits (TZS bn)" value={formatValue(institution.depositsTzsBillions, 'TZS bn')} />
        <DetailStat label="Capital adequacy (training)" value={formatValue(institution.capitalAdequacyRatioPercent, '%')} />
        <DetailStat label="NPL ratio (training)" value={formatValue(institution.nplRatioPercent, '%')} />
      </section>
      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <div><h2 className="panel-title">Reporting history</h2><p className="panel-caption">Source-record IDs are retained for traceability.</p></div>
        </div>
        {detail.reports.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Period</th><th>Deposits</th><th>Loans</th><th>Capital ratio</th><th>Liquidity</th><th>NPL ratio</th><th>Completeness</th><th>Source records</th></tr></thead>
              <tbody>
                {detail.reports.map((report) => (
                  <tr key={report.reportId}>
                    <td className="mono">{report.period}</td>
                    <td>{report.depositsTzsBillions.toFixed(1)}</td>
                    <td>{report.loansTzsBillions.toFixed(1)}</td>
                    <td>{report.capitalAdequacyRatioPercent.toFixed(1)}%</td>
                    <td>{report.liquidityRatioPercent.toFixed(1)}%</td>
                    <td>{report.nplRatioPercent.toFixed(1)}%</td>
                    <td>{report.completenessPercent.toFixed(1)}%</td>
                    <td className="mono">{report.sourceRecordIds.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty-state">No reports are available for this institution.</div>}
      </section>
      <section className="panel">
        <div className="panel-header">
          <div><h2 className="panel-title">Review signals</h2><p className="panel-caption">Illustrative threshold comparisons for training only.</p></div>
        </div>
        {detail.exceptions.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Period</th><th>Indicator</th><th>Observed</th><th>Training threshold</th><th>Severity</th><th>Status</th><th>Message</th></tr></thead>
              <tbody>
                {detail.exceptions.map((exception) => (
                  <tr key={exception.id}>
                    <td className="mono">{exception.period}</td>
                    <td>{exception.indicatorId}</td>
                    <td>{exception.observedValue}</td>
                    <td>{exception.thresholdValue}</td>
                    <td><span className={`severity-pill severity-${exception.severity}`}>{exception.severity}</span></td>
                    <td>{exception.status.replace('_', ' ')}</td>
                    <td>{exception.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty-state">No review signals are recorded for this institution.</div>}
      </section>
    </main>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return <div className="detail-stat"><span>{label}</span><strong>{value}</strong></div>;
}

function formatValue(value: number | null, unit: string): string {
  if (value === null) return '—';
  return unit === '%' ? `${value.toFixed(1)}%` : `${value.toFixed(1)} ${unit}`;
}

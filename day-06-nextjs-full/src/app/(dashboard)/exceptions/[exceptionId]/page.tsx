import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getExceptionById } from '@/lib/repository';
import { ExceptionTriageForm } from '@/components/exception-triage-form';

export default async function ExceptionDetailPage({
  params,
}: {
  params: Promise<{ exceptionId: string }>;
}) {
  const { exceptionId } = await params;

  let exception;
  try {
    exception = await getExceptionById(exceptionId);
  } catch {
    notFound();
  }

  const severityColor: Record<string, string> = {
    critical: '#DC2626',
    high: '#D97706',
    medium: '#2563EB',
    low: '#6B7280',
  };

  return (
    <main className="page-content">
      <div className="synthetic-banner">
        <span aria-hidden="true">ⓘ</span>
        <div>
          <strong>Illustrative review signal.</strong> This synthetic threshold comparison is for
          training purposes only and is not an official finding of regulatory non-compliance.
        </div>
      </div>

      <section className="page-heading">
        <div>
          <div className="eyebrow">
            <Link href="/exceptions">← Exceptions register</Link>
          </div>
          <h1>Review signal detail</h1>
          <p className="subtitle mono" style={{ fontSize: 13 }}>{exception.id}</p>
        </div>
        <span
          className={`severity-pill severity-${exception.severity}`}
          style={{ color: severityColor[exception.severity] ?? '#6B7280' }}
        >
          {exception.severity}
        </span>
      </section>

      {/* Evidence card */}
      <section className="panel" style={{ marginBottom: 24 }}>
        <div className="panel-header">
          <h2 className="panel-title">Breach evidence</h2>
        </div>
        <dl className="data-quality-list">
          <div>
            <dt>Institution</dt>
            <dd>
              <Link className="table-link" href={`/institutions/${encodeURIComponent(exception.institutionId)}`}>
                {exception.institutionName}
              </Link>
              <span className="mono" style={{ marginLeft: 8, color: '#758197', fontSize: 12 }}>
                {exception.institutionId}
              </span>
            </dd>
          </div>
          <div><dt>Reporting period</dt><dd className="mono">{exception.period}</dd></div>
          <div><dt>Indicator</dt><dd className="mono">{exception.indicatorId}</dd></div>
          <div>
            <dt>Observed value</dt>
            <dd className="mono" style={{ color: severityColor[exception.severity] }}>
              {exception.observedValue}
            </dd>
          </div>
          <div><dt>Training threshold</dt><dd className="mono">{exception.thresholdValue}</dd></div>
          <div><dt>Signal message</dt><dd>{exception.message}</dd></div>
          <div><dt>Status</dt><dd>{exception.status.replace('_', ' ')}</dd></div>
          <div>
            <dt>Source report</dt>
            <dd>
              <Link
                className="table-link"
                href={`/reports?institutionId=${encodeURIComponent(exception.institutionId)}&period=${encodeURIComponent(exception.period)}`}
              >
                {exception.reportId}
              </Link>
            </dd>
          </div>
          <div><dt>Raised at</dt><dd>{new Date(exception.createdAt).toLocaleString('en')}</dd></div>
        </dl>
      </section>

      {/* Triage form */}
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Review workflow</h2>
            <p className="panel-caption">
              Update the signal status. All changes are audited and emit a system event. Only
              supervisors and administrators can triage signals.
            </p>
          </div>
        </div>
        <ExceptionTriageForm
          exceptionId={exception.id}
          currentStatus={exception.status}
          onSuccess={() => { /* redirect handled client-side */ }}
        />
      </section>

      {/* Navigate back */}
      <section className="assistant-alternatives" style={{ marginTop: 24 }}>
        <span>Related pages</span>
        <Link className="table-link" href={`/institutions/${encodeURIComponent(exception.institutionId)}`}>
          Institution profile
        </Link>
        <Link className="table-link" href={`/analytics?period=${encodeURIComponent(exception.period)}&institutionId=${encodeURIComponent(exception.institutionId)}`}>
          Analytics for this period
        </Link>
        <Link className="table-link" href="/exceptions">
          Back to register
        </Link>
      </section>
    </main>
  );
}

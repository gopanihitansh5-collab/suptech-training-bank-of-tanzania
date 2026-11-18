import { query } from '@/lib/db';

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }
  return 'health_probe_failed';
}

export default async function SystemHealthPage() {
  let databaseAvailable = false;
  try {
    await query('SELECT 1');
    databaseAvailable = true;
  } catch (error) {
    console.error('Day 6 database health probe failed', { errorCode: errorCode(error) });
  }

  return (
    <main className="page-content">
      <div className="synthetic-banner">
        <span aria-hidden="true">ⓘ</span>
        <div>
          <strong>Local training environment.</strong> This page checks the
          isolated Day 6 database only; it does not report Bank of Tanzania or
          external infrastructure health.
        </div>
      </div>
      <section className="page-heading">
        <div>
          <div className="eyebrow">Runtime status</div>
          <h1>Integrations &amp; system health</h1>
          <p className="subtitle">Observed service availability for this local application.</p>
        </div>
      </section>
      <section className="metric-grid" aria-label="Local service status">
        <article className="metric-card">
          <div className="metric-label">Day 6 PostgreSQL</div>
          <div className="metric-value">{databaseAvailable ? 'Connected' : 'Unavailable'}</div>
          <div className="metric-foot">Isolated local database · 127.0.0.1:5433</div>
        </article>
        <article className="metric-card">
          <div className="metric-label">Optional local models</div>
          <div className="metric-value">Not connected</div>
          <div className="metric-foot">No model health request is made by this app.</div>
        </article>
        <article className="metric-card">
          <div className="metric-label">External BoT systems</div>
          <div className="metric-value">Not connected</div>
          <div className="metric-foot">This training PoC has no external integration.</div>
        </article>
      </section>
      {!databaseAvailable && (
        <section className="error-panel health-error" role="status">
          <h2>Database health check failed</h2>
          <p>The local Day 6 database could not be reached. Check the local database service and retry.</p>
        </section>
      )}
    </main>
  );
}

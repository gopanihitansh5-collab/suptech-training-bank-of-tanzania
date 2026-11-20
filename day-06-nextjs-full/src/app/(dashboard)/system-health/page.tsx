import { HealthRefresh } from '@/components/health-refresh';
import { getSystemHealth, type HealthCheckStatus } from '@/lib/health';

export const dynamic = 'force-dynamic';

const numberFormat = new Intl.NumberFormat('en');

function formatTimestamp(value: string | null): string {
  return value ? new Date(value).toLocaleString('en') : 'No events recorded';
}

function statusClass(status: HealthCheckStatus): string {
  if (status === 'ok') return 'status-pill';
  if (status === 'degraded') return 'severity-pill severity-medium';
  return 'severity-pill severity-critical';
}

function configuredLabel(value: boolean): string {
  return value ? 'Configured' : 'Missing';
}

export default async function SystemHealthPage() {
  const health = await getSystemHealth();
  const tableCounts = [
    { label: 'Institutions', value: health.database.tableCounts.institutions },
    { label: 'Reports', value: health.database.tableCounts.reports },
    { label: 'Indicators', value: health.database.tableCounts.indicators },
    { label: 'Exceptions', value: health.database.tableCounts.exceptions },
    { label: 'Documents', value: health.database.tableCounts.documents },
    { label: 'Chunks', value: health.database.tableCounts.chunks },
    { label: 'Ingestion jobs', value: health.database.tableCounts.ingestionJobs },
    { label: 'Users', value: health.database.tableCounts.users },
    { label: 'Audit events', value: health.database.tableCounts.auditEvents },
    { label: 'System events', value: health.database.tableCounts.systemEvents },
    { label: 'Conversations', value: health.database.tableCounts.conversations },
    { label: 'Messages', value: health.database.tableCounts.messages },
    { label: 'Report runs', value: health.database.tableCounts.reportRuns },
  ];

  const storageLabel = health.storage.mode === 's3'
    ? 'S3 object storage'
    : health.storage.writable === false
      ? 'Unavailable storage'
      : 'Local filesystem';
  const storageFoot =
    health.storage.writable === null
      ? 'Configured · writes not probed'
      : health.storage.writable
        ? 'Directory writable'
        : health.storage.location.includes('required on Vercel')
          ? 'Persistent object storage required'
          : 'Directory not writable';

  return (
    <main className="page-content">
      <div className="synthetic-banner">
        <span aria-hidden="true">ⓘ</span>
        <div>
          <strong>Training environment only.</strong> These probes report the
          services configured for this application. All displayed data is
          synthetic; this page does not report Bank of Tanzania infrastructure
          or regulatory-system health.
        </div>
      </div>
      <section className="page-heading">
        <div>
          <div className="eyebrow">Runtime status</div>
          <h1>Integrations &amp; system health</h1>
          <p className="subtitle">
            Live probe results recorded at {new Date(health.checkedAt).toLocaleString('en')}.
          </p>
        </div>
        <div className="page-heading-actions">
          <HealthRefresh />
        </div>
      </section>

      <section className="metric-grid" aria-label="Configured service status">
        <article className="metric-card">
          <div className="metric-label">Day 6 PostgreSQL</div>
          <div className="metric-value">{health.database.available ? 'Connected' : 'Unavailable'}</div>
          <div className="metric-foot">
            {health.database.available
              ? `Probe latency ${health.database.latencyMs ?? 0} ms`
              : 'Database probe failed'}
          </div>
        </article>
        <article className="metric-card">
          <div className="metric-label">AI service</div>
          <div className="metric-value">{health.model.chatAvailable ? 'Available' : 'Unavailable'}</div>
          <div className="metric-foot">Grounded analysis service · checked at page load</div>
        </article>
        <article className="metric-card">
          <div className="metric-label">Embeddings</div>
          <div className="metric-value">
            {health.model.embeddingAvailable ? 'Available' : 'Unavailable'}
          </div>
          <div className="metric-foot">Embedding service probe</div>
        </article>
        <article className="metric-card">
          <div className="metric-label">Upload storage</div>
          <div className="metric-value">
            {health.storage.mode === 's3'
              ? 'S3'
              : health.storage.writable === false
                ? 'Unavailable'
                : 'Local'}
          </div>
          <div className="metric-foot">{storageFoot}</div>
        </article>
        <article className="metric-card">
          <div className="metric-label">External BoT systems</div>
          <div className="metric-value">Not connected</div>
          <div className="metric-foot">Not connected by design</div>
        </article>
      </section>

      {!health.database.available && (
        <section className="error-panel health-error" role="status">
          <h2>Database health check failed</h2>
          <p>
            The local Day 6 database could not be reached. Counts below are shown
            as zero until the database service is available and the probes are
            refreshed.
          </p>
        </section>
      )}

      <div className="content-grid" style={{ marginBottom: 16 }}>
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Database</h2>
              <p className="panel-caption">Persisted Day 6 PostgreSQL state.</p>
            </div>
            <span className={health.database.available ? 'status-pill' : 'severity-pill severity-critical'}>
              {health.database.available ? 'Healthy' : 'Unavailable'}
            </span>
          </div>
          <dl className="settings-list" style={{ padding: '0 18px' }}>
            <div><dt>Server version</dt><dd className="mono">{health.database.version ?? 'Unavailable'}</dd></div>
            <div><dt>Database name</dt><dd className="mono">{health.database.databaseName ?? 'Unavailable'}</dd></div>
            <div><dt>Latest reporting period</dt><dd>{health.database.latestPeriod ?? 'No reports'}</dd></div>
            <div><dt>Last system event</dt><dd>{formatTimestamp(health.database.lastSystemEventAt)}</dd></div>
            <div><dt>Last audit event</dt><dd>{formatTimestamp(health.database.lastAuditEventAt)}</dd></div>
            <div><dt>Probe latency</dt><dd>{health.database.latencyMs === null ? 'Not measured' : `${health.database.latencyMs} ms`}</dd></div>
            <div><dt>Open review signals</dt><dd>{numberFormat.format(health.data.openExceptions)}</dd></div>
          </dl>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Table</th><th>Rows</th></tr></thead>
              <tbody>
                {tableCounts.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td className="mono">{numberFormat.format(row.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">AI services</h2>
              <p className="panel-caption">Availability of the grounded analysis and embedding services.</p>
            </div>
          </div>
          <dl className="settings-list" style={{ padding: '0 18px' }}>
            <div><dt>Analysis service</dt><dd>{health.model.chatAvailable ? 'Available' : 'Unavailable'}</dd></div>
            <div><dt>Embedding service</dt><dd>{health.model.embeddingAvailable ? 'Available' : 'Unavailable'}</dd></div>
            <div><dt>Backend details</dt><dd>Not exposed</dd></div>
          </dl>
        </section>
      </div>

      <div className="content-grid" style={{ marginBottom: 16 }}>
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Upload storage</h2>
              <p className="panel-caption">Document and ingestion state for this environment.</p>
            </div>
          </div>
          <dl className="settings-list" style={{ padding: '0 18px' }}>
            <div><dt>Mode</dt><dd>{health.storage.mode}</dd></div>
            <div><dt>Location</dt><dd className="mono">{health.storage.location}</dd></div>
            <div>
              <dt>Writable</dt>
              <dd>
                {health.storage.writable === null
                  ? 'Not probed'
                  : health.storage.writable
                    ? 'Yes'
                    : 'No'}
              </dd>
            </div>
            <div><dt>Documents</dt><dd>{numberFormat.format(health.storage.documents)}</dd></div>
            <div><dt>Chunks</dt><dd>{numberFormat.format(health.storage.chunks)}</dd></div>
            <div><dt>Pending jobs</dt><dd>{numberFormat.format(health.storage.pendingJobs)}</dd></div>
            <div><dt>Failed jobs</dt><dd>{numberFormat.format(health.storage.failedJobs)}</dd></div>
            <div><dt>Last ingestion</dt><dd>{formatTimestamp(health.storage.lastIngestionAt)}</dd></div>
          </dl>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Configuration</h2>
              <p className="panel-caption">Names and presence only. Values are never displayed.</p>
            </div>
          </div>
          <dl className="settings-list" style={{ padding: '0 18px' }}>
            <div><dt>DATABASE_URL</dt><dd>{configuredLabel(health.config.databaseUrlConfigured)}</dd></div>
            <div><dt>AUTH_SECRET</dt><dd>{configuredLabel(health.config.authSecretConfigured)}</dd></div>
            <div><dt>Demo user</dt><dd>{configuredLabel(health.config.demoUserConfigured)}</dd></div>
            <div><dt>Demo role</dt><dd>{health.config.demoRole}</dd></div>
            <div><dt>AI service</dt><dd>{configuredLabel(health.config.chatProviderConfigured)}</dd></div>
            <div><dt>Remote database</dt><dd>{health.config.remoteDatabase ? 'Yes' : 'No'}</dd></div>
            <div><dt>S3-compatible storage</dt><dd>{configuredLabel(health.config.s3Configured)}</dd></div>
            <div><dt>Embedding service</dt><dd>{configuredLabel(health.config.lmStudioConfigured)}</dd></div>
            <div>
              <dt>Missing variables</dt>
              <dd className="mono">
                {health.config.missing.length > 0 ? health.config.missing.join(', ') : 'None'}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Probe checks</h2>
            <p className="panel-caption">
              External BoT integration remains intentionally disconnected for this training PoC.
            </p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Check</th><th>Status</th><th>Detail</th><th>Latency</th></tr>
            </thead>
            <tbody>
              {health.checks.map((check) => (
                <tr key={check.name}>
                  <td>{check.name}</td>
                  <td><span className={statusClass(check.status)}>{check.status}</span></td>
                  <td>{check.detail}</td>
                  <td className="mono">
                    {check.latencyMs === undefined ? '—' : `${check.latencyMs} ms`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

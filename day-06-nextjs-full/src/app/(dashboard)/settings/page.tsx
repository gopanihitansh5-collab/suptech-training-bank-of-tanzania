import { getAdminOverview, type AdminOverview } from '@/lib/admin';
import { requireDemoSession } from '@/lib/auth';

const numberFormat = new Intl.NumberFormat('en');

function formatTimestamp(value: string | null): string {
  return value ? new Date(value).toLocaleString('en') : 'Never';
}

function preview(value: unknown): string {
  try {
    const text = JSON.stringify(value ?? {});
    return text.length > 140 ? `${text.slice(0, 137)}...` : text;
  } catch {
    return 'Unreadable payload';
  }
}

function configuredLabel(value: boolean): string {
  return value ? 'Configured' : 'Missing';
}

export default async function SettingsPage() {
  const session = await requireDemoSession();
  let overview: AdminOverview | null = null;
  try {
    overview = await getAdminOverview();
  } catch {
    overview = null;
  }

  const sessionCapabilities =
    overview?.roles.find((role) => role.roleId === session.role)?.permissions ?? [];
  const counts = overview?.counts;

  return (
    <main className="page-content">
      <div className="synthetic-banner">
        <span aria-hidden="true">ⓘ</span>
        <div>
          <strong>Read-only demo settings.</strong> This local training account
          is not a production identity or authorization system. Configuration
          writes are intentionally disabled and thresholds are code-defined
          training values, not editable policy.
        </div>
      </div>
      <section className="page-heading">
        <div>
          <div className="eyebrow">Access and configuration</div>
          <h1>Administration &amp; settings</h1>
          <p className="subtitle">
            Live database-backed administrative evidence, with secrets reduced to presence only.
          </p>
        </div>
        <div className="page-heading-actions">
          {session.role === 'admin' ? (
            <a className="button-primary" href="/api/admin/audit-export">
              Download audit CSV
            </a>
          ) : (
            <span className="period-chip">Admin role required</span>
          )}
        </div>
      </section>

      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Current session</h2>
            <p className="panel-caption">Values shown here come from the signed local demo session.</p>
          </div>
        </div>
        <dl className="settings-list" style={{ padding: '0 18px' }}>
          <div><dt>User ID</dt><dd className="mono">{session.userId}</dd></div>
          <div><dt>Role</dt><dd>{session.role}</dd></div>
          <div><dt>Session expiry</dt><dd>{formatTimestamp(new Date(session.expiresAt).toISOString())}</dd></div>
          <div><dt>Authentication method</dt><dd>Signed local demo cookie</dd></div>
          <div>
            <dt>Role capabilities</dt>
            <dd className="mono">
              {sessionCapabilities.length > 0 ? sessionCapabilities.join(', ') : 'No capabilities recorded'}
            </dd>
          </div>
        </dl>
      </section>

      {!overview && (
        <section className="error-panel" role="status">
          <h2>Administrative data unavailable</h2>
          <p>
            The local Day 6 database could not be queried. The session above is
            still valid; refresh once the database service is available.
          </p>
        </section>
      )}

      {overview && counts && (
        <>
          <section className="metric-grid" aria-label="Persisted administration counts">
            <article className="metric-card">
              <div className="metric-label">Users</div>
              <div className="metric-value">{numberFormat.format(counts.users)}</div>
              <div className="metric-foot">Demo RBAC mirror</div>
            </article>
            <article className="metric-card">
              <div className="metric-label">Conversations</div>
              <div className="metric-value">{numberFormat.format(counts.conversations)}</div>
              <div className="metric-foot">Assistant threads</div>
            </article>
            <article className="metric-card">
              <div className="metric-label">Messages</div>
              <div className="metric-value">{numberFormat.format(counts.messages)}</div>
              <div className="metric-foot">Assistant messages</div>
            </article>
            <article className="metric-card">
              <div className="metric-label">Report runs</div>
              <div className="metric-value">{numberFormat.format(counts.reportRuns)}</div>
              <div className="metric-foot">Persisted exports</div>
            </article>
            <article className="metric-card">
              <div className="metric-label">Documents</div>
              <div className="metric-value">{numberFormat.format(counts.documents)}</div>
              <div className="metric-foot">Uploaded training files</div>
            </article>
            <article className="metric-card">
              <div className="metric-label">Chunks</div>
              <div className="metric-value">{numberFormat.format(counts.chunks)}</div>
              <div className="metric-foot">Retrieval chunks</div>
            </article>
            <article className="metric-card">
              <div className="metric-label">Ingestion jobs</div>
              <div className="metric-value">{numberFormat.format(counts.ingestionJobs)}</div>
              <div className="metric-foot">Document processing</div>
            </article>
            <article className="metric-card">
              <div className="metric-label">Audit events</div>
              <div className="metric-value">{numberFormat.format(counts.auditEvents)}</div>
              <div className="metric-foot">Administrative trail</div>
            </article>
            <article className="metric-card">
              <div className="metric-label">System events</div>
              <div className="metric-value">{numberFormat.format(counts.systemEvents)}</div>
              <div className="metric-foot">Runtime event stream</div>
            </article>
          </section>

          <section className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Users</h2>
                <p className="panel-caption">Demo identity mirror persisted in PostgreSQL.</p>
              </div>
              <span className="period-chip">{overview.users.length} user(s)</span>
            </div>
            {overview.users.length > 0 ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>User</th><th>Role</th><th>Enabled</th><th>Created</th><th>Last login</th></tr>
                  </thead>
                  <tbody>
                    {overview.users.map((user) => (
                      <tr key={user.userId}>
                        <td className="mono">{user.userId}</td>
                        <td>{user.roleLabel} <span className="mono">({user.roleId})</span></td>
                        <td>
                          <span className={user.enabled ? 'status-pill' : 'severity-pill severity-medium'}>
                            {user.enabled ? 'enabled' : 'disabled'}
                          </span>
                        </td>
                        <td>{formatTimestamp(user.createdAt)}</td>
                        <td>{formatTimestamp(user.lastLoginAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state" role="status">No users are recorded in the demo RBAC mirror.</div>
            )}
          </section>

          <section className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Roles and permissions</h2>
                <p className="panel-caption">Read-only mirror of the demo authorization matrix.</p>
              </div>
              <span className="period-chip">{overview.roles.length} role(s)</span>
            </div>
            {overview.roles.length > 0 ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Role</th><th>Label</th><th>Permissions</th></tr>
                  </thead>
                  <tbody>
                    {overview.roles.map((role) => (
                      <tr key={role.roleId}>
                        <td className="mono">{role.roleId}</td>
                        <td>{role.label}</td>
                        <td className="mono">
                          {role.permissions.length > 0 ? role.permissions.join(', ') : 'None'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state" role="status">No roles are recorded.</div>
            )}
          </section>

          <section className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Threshold configuration</h2>
                <p className="panel-caption">
                  Code-defined training boundaries mirrored read-only in the database. Editing is disabled.
                </p>
              </div>
              <span className="period-chip">{overview.thresholds.length} threshold(s)</span>
            </div>
            {overview.thresholds.length > 0 ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Indicator</th><th>Label</th><th>Operator</th><th>Value</th>
                      <th>Severity</th><th>Enabled</th><th>Training</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.thresholds.map((threshold) => (
                      <tr key={threshold.thresholdId}>
                        <td className="mono">{threshold.indicatorId}</td>
                        <td>{threshold.label}</td>
                        <td className="mono">{threshold.operator}</td>
                        <td className="mono">{threshold.value}</td>
                        <td>
                          <span className={`severity-pill severity-${threshold.severity}`}>
                            {threshold.severity}
                          </span>
                        </td>
                        <td>{threshold.enabled ? 'Yes' : 'No'}</td>
                        <td>{threshold.training ? 'Training value' : 'Runtime value'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state" role="status">No threshold configurations are recorded.</div>
            )}
          </section>

          <section className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Indicator catalog</h2>
                <p className="panel-caption">Canonical indicator definitions mirrored from the training catalog.</p>
              </div>
              <span className="period-chip">{overview.indicators.length} indicator(s)</span>
            </div>
            {overview.indicators.length > 0 ? (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>ID</th><th>Label</th><th>Unit</th><th>Formula</th></tr></thead>
                  <tbody>
                    {overview.indicators.map((indicator) => (
                      <tr key={indicator.indicatorId}>
                        <td className="mono">{indicator.indicatorId}</td>
                        <td>{indicator.label}</td>
                        <td className="mono">{indicator.unit}</td>
                        <td>{indicator.formula}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state" role="status">No indicator definitions are recorded.</div>
            )}
          </section>

          <section className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Recent audit events</h2>
                <p className="panel-caption">Latest 15 persisted administrative events. The audit export is restricted to administrators.</p>
              </div>
              <span className="period-chip">{overview.auditEvents.length} event(s)</span>
            </div>
            {overview.auditEvents.length > 0 ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>ID</th><th>Actor</th><th>Action</th><th>Entity</th><th>Happened</th><th>Details</th></tr>
                  </thead>
                  <tbody>
                    {overview.auditEvents.map((event) => (
                      <tr key={event.id}>
                        <td className="mono">{event.id}</td>
                        <td className="mono">{event.actorId}</td>
                        <td>{event.action}</td>
                        <td className="mono">
                          {event.entityType}
                          {event.entityId ? ` · ${event.entityId}` : ''}
                        </td>
                        <td>{formatTimestamp(event.happenedAt)}</td>
                        <td className="mono">{preview(event.details)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state" role="status">No audit events are recorded.</div>
            )}
          </section>

          <section className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Recent system events</h2>
                <p className="panel-caption">Latest 15 runtime events persisted by the application.</p>
              </div>
              <span className="period-chip">{overview.systemEvents.length} event(s)</span>
            </div>
            {overview.systemEvents.length > 0 ? (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>ID</th><th>Event type</th><th>Payload</th><th>Created</th></tr></thead>
                  <tbody>
                    {overview.systemEvents.map((event) => (
                      <tr key={event.id}>
                        <td className="mono">{event.id}</td>
                        <td>{event.eventType}</td>
                        <td className="mono">{preview(event.payload)}</td>
                        <td>{formatTimestamp(event.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state" role="status">No system events are recorded.</div>
            )}
          </section>

          <section className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Report runs</h2>
                <p className="panel-caption">Latest 10 persisted report exports and their filters.</p>
              </div>
              <span className="period-chip">{overview.reportRuns.length} run(s)</span>
            </div>
            {overview.reportRuns.length > 0 ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>ID</th><th>Status</th><th>Results</th><th>Created by</th><th>Created</th><th>Filters</th></tr>
                  </thead>
                  <tbody>
                    {overview.reportRuns.map((run) => (
                      <tr key={run.id}>
                        <td className="mono">{run.id}</td>
                        <td><span className="status-pill">{run.status}</span></td>
                        <td className="mono">{numberFormat.format(run.resultCount)}</td>
                        <td className="mono">{run.createdBy}</td>
                        <td>{formatTimestamp(run.createdAt)}</td>
                        <td className="mono">{preview(run.filters)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state" role="status">No report runs are recorded.</div>
            )}
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Configuration status</h2>
                <p className="panel-caption">
                  Environment presence only. Secret values are never displayed, and configuration writes are disabled.
                </p>
              </div>
            </div>
            <dl className="settings-list" style={{ padding: '0 18px' }}>
              <div><dt>DATABASE_URL</dt><dd>{configuredLabel(overview.config.databaseUrlConfigured)}</dd></div>
              <div><dt>AUTH_SECRET</dt><dd>{configuredLabel(overview.config.authSecretConfigured)}</dd></div>
              <div><dt>Demo user</dt><dd>{configuredLabel(overview.config.demoUserConfigured)}</dd></div>
              <div><dt>Demo role</dt><dd>{overview.config.demoRole}</dd></div>
              <div><dt>Remote database</dt><dd>{overview.config.remoteDatabase ? 'Yes' : 'No'}</dd></div>
              <div><dt>S3-compatible storage</dt><dd>{configuredLabel(overview.config.s3Configured)}</dd></div>
              <div><dt>AI service</dt><dd>{configuredLabel(overview.config.chatProviderConfigured)}</dd></div>
              <div><dt>Embedding service</dt><dd>{configuredLabel(overview.config.lmStudioConfigured)}</dd></div>
              <div>
                <dt>Missing variables</dt>
                <dd className="mono">
                  {overview.config.missing.length > 0 ? overview.config.missing.join(', ') : 'None'}
                </dd>
              </div>
            </dl>
          </section>
        </>
      )}
    </main>
  );
}

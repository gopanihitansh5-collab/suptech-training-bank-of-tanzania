import type { QueryResult, QueryResultRow } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { query } from './db';
import { getAdminOverview } from './admin';

vi.mock('./db', () => ({ query: vi.fn() }));

function queryResult<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return { command: 'SELECT', rowCount: rows.length, oid: 0, fields: [], rows };
}

function stubBaseEnv(): void {
  vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@127.0.0.1:5433/suptech_day6');
  vi.stubEnv('AUTH_SECRET', 'a'.repeat(40));
  vi.stubEnv('DEMO_USERNAME', 'demo.admin');
  vi.stubEnv('DEMO_PASSWORD', 'demo-password');
  vi.stubEnv('DEMO_ROLE', 'admin');
  vi.stubEnv('AWS_REGION', '');
  vi.stubEnv('AWS_ENDPOINT_URL_S3', '');
  vi.stubEnv('LM_STUDIO_BASE_URL', '');
}

function emptyResults(): void {
  for (let index = 0; index < 8; index += 1) {
    vi.mocked(query).mockResolvedValueOnce(queryResult([]));
  }
}

describe('administration overview', () => {
  beforeEach(() => {
    vi.mocked(query).mockReset();
    stubBaseEnv();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('maps users, roles, thresholds, indicators, events, runs, and counts', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce(queryResult([
        {
          user_id: 'demo.admin',
          role_id: 'admin',
          role_label: 'Demo administrator',
          enabled: true,
          created_at: '2026-01-01T00:00:00.000Z',
          last_login_at: '2026-11-18T09:30:00.000Z',
        },
        {
          user_id: 'demo.viewer',
          role_id: 'viewer',
          role_label: null,
          enabled: false,
          created_at: '2026-02-01T00:00:00.000Z',
          last_login_at: null,
        },
      ]))
      .mockResolvedValueOnce(queryResult([
        { role_id: 'admin', label: 'Demo administrator', permissions: ['configure:demo', 'read:synthetic'] },
        { role_id: 'viewer', label: 'Demo viewer', permissions: [] },
      ]))
      .mockResolvedValueOnce(queryResult([
        {
          threshold_id: 'TRN-CAR-LOW',
          indicator_id: 'capital_adequacy',
          label: 'Capital ratio review signal',
          operator: 'lt',
          threshold_value: '10',
          severity: 'critical',
          rationale: 'Training-only comparison boundary.',
          enabled: true,
          is_training_configuration: true,
        },
      ]))
      .mockResolvedValueOnce(queryResult([
        {
          indicator_id: 'capital_adequacy',
          label: 'Capital adequacy',
          unit: '%',
          formula: 'reported capital adequacy ratio',
          description: 'Illustrative synthetic ratio.',
        },
      ]))
      .mockResolvedValueOnce(queryResult([
        {
          audit_event_id: '12',
          actor_id: 'demo.admin',
          action: 'audit_exported',
          entity_type: 'audit_event',
          entity_id: null,
          details: { rowCount: 3 },
          happened_at: '2026-11-18T10:00:00.000Z',
        },
      ]))
      .mockResolvedValueOnce(queryResult([
        {
          event_id: '9',
          event_type: 'synthetic_seed_completed',
          payload: { institutions: 14 },
          created_at: '2026-11-18T09:00:00.000Z',
        },
      ]))
      .mockResolvedValueOnce(queryResult([
        {
          report_run_id: 'run-1',
          status: 'completed',
          result_count: '4',
          created_by: 'demo.admin',
          created_at: '2026-11-18T08:00:00.000Z',
          filters: { period: '2026-10' },
        },
      ]))
      .mockResolvedValueOnce(queryResult([
        {
          users: 2,
          conversations: 5,
          messages: 40,
          report_runs: 6,
          documents: 4,
          chunks: 120,
          ingestion_jobs: 3,
          audit_events: 8,
          system_events: 11,
        },
      ]));

    const overview = await getAdminOverview();

    expect(overview.users).toEqual([
      {
        userId: 'demo.admin',
        roleId: 'admin',
        roleLabel: 'Demo administrator',
        enabled: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        lastLoginAt: '2026-11-18T09:30:00.000Z',
      },
      {
        userId: 'demo.viewer',
        roleId: 'viewer',
        roleLabel: 'viewer',
        enabled: false,
        createdAt: '2026-02-01T00:00:00.000Z',
        lastLoginAt: null,
      },
    ]);
    expect(overview.roles[0]).toEqual({
      roleId: 'admin',
      label: 'Demo administrator',
      permissions: ['configure:demo', 'read:synthetic'],
    });
    expect(overview.roles[1].permissions).toEqual([]);
    expect(overview.thresholds[0]).toEqual({
      thresholdId: 'TRN-CAR-LOW',
      indicatorId: 'capital_adequacy',
      label: 'Capital ratio review signal',
      operator: 'lt',
      value: 10,
      severity: 'critical',
      rationale: 'Training-only comparison boundary.',
      enabled: true,
      training: true,
    });
    expect(overview.indicators[0].indicatorId).toBe('capital_adequacy');
    expect(overview.auditEvents[0]).toEqual({
      id: '12',
      actorId: 'demo.admin',
      action: 'audit_exported',
      entityType: 'audit_event',
      entityId: null,
      details: { rowCount: 3 },
      happenedAt: '2026-11-18T10:00:00.000Z',
    });
    expect(overview.systemEvents[0].id).toBe('9');
    expect(overview.reportRuns[0]).toMatchObject({ id: 'run-1', resultCount: 4 });
    expect(overview.counts).toEqual({
      users: 2,
      conversations: 5,
      messages: 40,
      reportRuns: 6,
      documents: 4,
      chunks: 120,
      ingestionJobs: 3,
      auditEvents: 8,
      systemEvents: 11,
    });
    expect(overview.config.demoRole).toBe('admin');
  });

  it('returns empty collections and zero counts when tables are empty', async () => {
    emptyResults();

    const overview = await getAdminOverview();

    expect(overview.users).toEqual([]);
    expect(overview.roles).toEqual([]);
    expect(overview.thresholds).toEqual([]);
    expect(overview.indicators).toEqual([]);
    expect(overview.auditEvents).toEqual([]);
    expect(overview.systemEvents).toEqual([]);
    expect(overview.reportRuns).toEqual([]);
    expect(overview.counts).toEqual({
      users: 0,
      conversations: 0,
      messages: 0,
      reportRuns: 0,
      documents: 0,
      chunks: 0,
      ingestionJobs: 0,
      auditEvents: 0,
      systemEvents: 0,
    });
  });

  it('exposes configuration presence without secret values', async () => {
    const authSecret = 'unit-test-admin-auth-secret-value-123456';
    const demoPassword = 'unit-test-admin-demo-password-value';
    const databasePassword = 'unit-test-admin-database-password-value';
    vi.stubEnv('AUTH_SECRET', authSecret);
    vi.stubEnv('DEMO_PASSWORD', demoPassword);
    vi.stubEnv(
      'DATABASE_URL',
      `postgresql://user:${databasePassword}@127.0.0.1:5433/suptech_day6`,
    );
    emptyResults();

    const overview = await getAdminOverview();
    const serialized = JSON.stringify(overview);

    expect(overview.config).toMatchObject({
      databaseUrlConfigured: true,
      authSecretConfigured: true,
      demoUserConfigured: true,
      remoteDatabase: false,
    });
    expect(serialized).not.toContain(authSecret);
    expect(serialized).not.toContain(demoPassword);
    expect(serialized).not.toContain(databasePassword);
    expect(overview.config.missing).toEqual([
      'LM_STUDIO_BASE_URL',
    ]);
  });
});

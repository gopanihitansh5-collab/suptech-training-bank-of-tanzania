import { access } from 'node:fs/promises';
import type { QueryResult, QueryResultRow } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { query } from './db';
import { getSystemHealth } from './health';
import { clearChatProviderAvailabilityCache } from './model-provider';

vi.mock('./db', () => ({ query: vi.fn() }));
vi.mock('node:fs/promises', () => ({
  access: vi.fn(),
  constants: { W_OK: 2 },
}));

function queryResult<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return { command: 'SELECT', rowCount: rows.length, oid: 0, fields: [], rows };
}

function countRow(overrides: Record<string, unknown> = {}): QueryResultRow {
  return {
    institutions: 14,
    reports: 337,
    indicators: 3022,
    exceptions: 9,
    documents: 4,
    chunks: 120,
    ingestion_jobs: 3,
    users: 2,
    audit_events: 8,
    system_events: 11,
    conversations: 5,
    messages: 40,
    report_runs: 6,
    latest_period: '2026-10',
    last_system_event_at: '2026-11-18T10:00:00.000Z',
    last_audit_event_at: '2026-11-18T09:00:00.000Z',
    last_ingestion_at: '2026-11-17T08:00:00.000Z',
    pending_jobs: 1,
    failed_jobs: 2,
    open_exceptions: 7,
    ...overrides,
  };
}

function stubModelList(ids: string[]): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ data: ids.map((id) => ({ id })) }), { status: 200 }),
    ),
  );
}

function stubBaseEnv(): void {
  vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@127.0.0.1:5433/suptech_day6');
  vi.stubEnv('AUTH_SECRET', 'a'.repeat(40));
  vi.stubEnv('DEMO_USERNAME', 'demo.admin');
  vi.stubEnv('DEMO_PASSWORD', 'demo-password');
  vi.stubEnv('DEMO_ROLE', 'admin');
  vi.stubEnv('AWS_REGION', '');
  vi.stubEnv('AWS_ENDPOINT_URL_S3', '');
  vi.stubEnv('AWS_S3_BUCKET', '');
  vi.stubEnv('MODEL_PROVIDER', 'lmstudio');
  vi.stubEnv('GROQ_API_KEY', '');
  vi.stubEnv('LM_STUDIO_BASE_URL', '');
  vi.stubEnv('LOCAL_UPLOADS_DIR', '');
}

describe('system health probes', () => {
  beforeEach(() => {
    vi.mocked(query).mockReset();
    vi.mocked(access).mockReset();
    clearChatProviderAvailabilityCache();
    stubBaseEnv();
  });

  afterEach(() => {
    clearChatProviderAvailabilityCache();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('maps database counts, model probes, and local storage when the database is available', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([{ version: 'PostgreSQL 16.4', database_name: 'suptech_day6' }]))
      .mockResolvedValueOnce(queryResult([countRow()]));
    vi.mocked(access).mockResolvedValue(undefined);
    stubModelList(['qwen/qwen3.6-35b-a3b', 'text-embedding-nomic-embed-text-v1.5']);

    const health = await getSystemHealth();

    expect(health.database.available).toBe(true);
    expect(health.database.latencyMs).toEqual(expect.any(Number));
    expect(health.database.version).toBe('PostgreSQL 16.4');
    expect(health.database.databaseName).toBe('suptech_day6');
    expect(health.database.tableCounts).toEqual({
      institutions: 14,
      reports: 337,
      indicators: 3022,
      exceptions: 9,
      documents: 4,
      chunks: 120,
      ingestionJobs: 3,
      users: 2,
      auditEvents: 8,
      systemEvents: 11,
      conversations: 5,
      messages: 40,
      reportRuns: 6,
    });
    expect(health.database.latestPeriod).toBe('2026-10');
    expect(health.database.lastSystemEventAt).toBe('2026-11-18T10:00:00.000Z');
    expect(health.database.lastAuditEventAt).toBe('2026-11-18T09:00:00.000Z');
    expect(health.data.openExceptions).toBe(7);
    expect(health.model.chatAvailable).toBe(true);
    expect(health.model.embeddingAvailable).toBe(true);
    expect(health.model.baseUrl).toBe('http://127.0.0.1:1235/v1');
    expect(health.storage).toMatchObject({
      mode: 'local',
      location: '.local/uploads',
      writable: true,
      documents: 4,
      chunks: 120,
      pendingJobs: 1,
      failedJobs: 2,
      lastIngestionAt: '2026-11-17T08:00:00.000Z',
    });
    expect(health.config).toMatchObject({
      databaseUrlConfigured: true,
      authSecretConfigured: true,
      demoUserConfigured: true,
      demoRole: 'admin',
      remoteDatabase: false,
      s3Configured: false,
      lmStudioConfigured: false,
    });
    expect(health.config.missing).toEqual([
      'LM_STUDIO_BASE_URL',
    ]);
    expect(health.checks.map((check) => [check.name, check.status])).toEqual([
      ['Database', 'ok'],
      ['Chat model', 'ok'],
      ['Embeddings', 'ok'],
      ['Upload storage', 'ok'],
      ['Event stream', 'ok'],
      ['External BoT integration', 'degraded'],
    ]);
    expect(health.checks.at(-1)?.detail).toBe('Not connected by design');
  });

  it('probes Groq for chat and never returns its API key', async () => {
    vi.stubEnv('MODEL_PROVIDER', 'groq');
    vi.stubEnv('GROQ_API_KEY', 'unit-test-groq-key');
    vi.mocked(query)
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([{ version: 'PostgreSQL 16.4', database_name: 'suptech_day6' }]))
      .mockResolvedValueOnce(queryResult([countRow()]));
    vi.mocked(access).mockResolvedValue(undefined);
    stubModelList(['openai/gpt-oss-120b']);

    const health = await getSystemHealth();

    expect(health.model).toMatchObject({
      provider: 'groq',
      chatAvailable: true,
      chatModel: 'openai/gpt-oss-120b',
      baseUrl: 'https://api.groq.com/openai/v1',
    });
    expect(health.config).toMatchObject({
      chatProvider: 'groq',
      chatProviderConfigured: true,
      groqApiKeyConfigured: true,
    });
    expect(health.checks.find((check) => check.name === 'Chat model')?.detail)
      .toContain('Groq');
    expect(JSON.stringify(health)).not.toContain('unit-test-groq-key');
  });

  it('returns a complete degraded object when the database probe fails', async () => {
    vi.mocked(query).mockRejectedValue(new Error('database down'));
    vi.mocked(access).mockRejectedValue(new Error('not writable'));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('model offline')));

    const health = await getSystemHealth();

    expect(health.database.available).toBe(false);
    expect(health.database.latencyMs).toBeNull();
    expect(health.database.version).toBeNull();
    expect(health.database.databaseName).toBeNull();
    expect(health.database.latestPeriod).toBeNull();
    expect(health.database.tableCounts.institutions).toBe(0);
    expect(health.model.chatAvailable).toBe(false);
    expect(health.model.embeddingAvailable).toBe(false);
    expect(health.storage.mode).toBe('local');
    expect(health.storage.writable).toBe(false);
    expect(health.config.databaseUrlConfigured).toBe(true);
    expect(health.config.demoRole).toBe('admin');
    expect(health.checks[0]).toMatchObject({ name: 'Database', status: 'unavailable' });
    expect(health.checks.at(-1)).toMatchObject({
      name: 'External BoT integration',
      status: 'degraded',
    });
  });

  it('never includes secret values in the health payload', async () => {
    const authSecret = 'unit-test-auth-secret-value-1234567890';
    const demoPassword = 'unit-test-demo-password-value';
    const databasePassword = 'unit-test-database-password-value';
    vi.stubEnv('AUTH_SECRET', authSecret);
    vi.stubEnv('DEMO_PASSWORD', demoPassword);
    vi.stubEnv(
      'DATABASE_URL',
      `postgresql://user:${databasePassword}@127.0.0.1:5433/suptech_day6`,
    );
    vi.stubEnv('AWS_REGION', 'us-east-1');
    vi.stubEnv('AWS_ENDPOINT_URL_S3', 'http://127.0.0.1:9000');
    vi.stubEnv('LM_STUDIO_BASE_URL', 'http://127.0.0.1:1235/v1');
    vi.mocked(query)
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([{ version: 'PostgreSQL 16.4', database_name: 'suptech_day6' }]))
      .mockResolvedValueOnce(queryResult([countRow()]));
    stubModelList(['qwen/qwen3.6-35b-a3b', 'text-embedding-nomic-embed-text-v1.5']);

    const serialized = JSON.stringify(await getSystemHealth());

    expect(serialized).not.toContain(authSecret);
    expect(serialized).not.toContain(demoPassword);
    expect(serialized).not.toContain(databasePassword);
    expect(serialized).toContain('"databaseUrlConfigured":true');
  });

  it('selects S3 storage from environment presence without probing writes', async () => {
    vi.stubEnv('AWS_REGION', 'us-east-1');
    vi.stubEnv('AWS_ENDPOINT_URL_S3', 'http://127.0.0.1:9000');
    vi.stubEnv('AWS_S3_BUCKET', 'suptech-uploads');
    vi.stubEnv('AWS_ACCESS_KEY_ID', 'test-key');
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'test-secret');
    vi.mocked(query)
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([{ version: 'PostgreSQL 16.4', database_name: 'suptech_day6' }]))
      .mockResolvedValueOnce(queryResult([countRow()]));
    stubModelList(['qwen/qwen3.6-35b-a3b', 'text-embedding-nomic-embed-text-v1.5']);

    const health = await getSystemHealth();

    expect(health.storage.mode).toBe('s3');
    expect(health.storage.location).toContain('suptech-uploads');
    expect(health.storage.location).toContain('http://127.0.0.1:9000');
    expect(health.storage.writable).toBeNull();
    expect(access).not.toHaveBeenCalled();
    expect(health.checks.find((check) => check.name === 'Upload storage')?.status).toBe('ok');
  });

  it('marks document storage unavailable on Vercel without persistent object storage', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.mocked(query)
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([{ version: 'PostgreSQL 16.4', database_name: 'suptech_day6' }]))
      .mockResolvedValueOnce(queryResult([countRow()]));
    stubModelList(['qwen/qwen3.6-35b-a3b', 'text-embedding-nomic-embed-text-v1.5']);

    const health = await getSystemHealth();

    expect(health.storage.writable).toBe(false);
    expect(health.storage.location).toContain('required on Vercel');
    expect(health.checks.find((check) => check.name === 'Upload storage')?.status)
      .toBe('unavailable');
    expect(health.config.missing).toEqual(expect.arrayContaining([
      'AWS_REGION',
      'AWS_ENDPOINT_URL_S3',
      'AWS_S3_BUCKET',
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
    ]));
    expect(access).not.toHaveBeenCalled();
  });

  it('marks local upload storage degraded when the directory is not writable', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([{ version: 'PostgreSQL 16.4', database_name: 'suptech_day6' }]))
      .mockResolvedValueOnce(queryResult([countRow()]));
    vi.mocked(access).mockRejectedValue(new Error('permission denied'));
    stubModelList(['qwen/qwen3.6-35b-a3b', 'text-embedding-nomic-embed-text-v1.5']);

    const health = await getSystemHealth();

    expect(health.storage.writable).toBe(false);
    expect(health.checks.find((check) => check.name === 'Upload storage')?.status).toBe('degraded');
  });
});

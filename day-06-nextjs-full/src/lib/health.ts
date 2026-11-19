import * as fs from 'node:fs/promises';
import path from 'node:path';
import type { QueryResultRow } from 'pg';
import { query } from './db';
import {
  getLocalModelBaseUrl,
  isLocalChatModelAvailable,
  isLocalEmbeddingModelAvailable,
} from './local-model';

export type HealthCheckStatus = 'ok' | 'degraded' | 'unavailable';

export interface HealthCheck {
  name: string;
  status: HealthCheckStatus;
  detail: string;
  latencyMs?: number;
}

export interface TableCounts {
  institutions: number;
  reports: number;
  indicators: number;
  exceptions: number;
  documents: number;
  chunks: number;
  ingestionJobs: number;
  users: number;
  auditEvents: number;
  systemEvents: number;
  conversations: number;
  messages: number;
  reportRuns: number;
}

export interface HealthConfig {
  databaseUrlConfigured: boolean;
  authSecretConfigured: boolean;
  demoUserConfigured: boolean;
  demoRole: string;
  remoteDatabase: boolean;
  s3Configured: boolean;
  lmStudioConfigured: boolean;
  missing: string[];
}

export interface SystemHealth {
  checkedAt: string;
  database: {
    available: boolean;
    latencyMs: number | null;
    version: string | null;
    databaseName: string | null;
    tableCounts: TableCounts;
    latestPeriod: string | null;
    lastSystemEventAt: string | null;
    lastAuditEventAt: string | null;
  };
  model: {
    chatAvailable: boolean;
    embeddingAvailable: boolean;
    baseUrl: string;
    chatModel: string;
    embeddingModel: string;
  };
  storage: {
    mode: 's3' | 'local';
    location: string;
    writable: boolean | null;
    documents: number;
    chunks: number;
    pendingJobs: number;
    failedJobs: number;
    lastIngestionAt: string | null;
  };
  data: TableCounts & { openExceptions: number };
  events: {
    systemEvents: number;
    auditEvents: number;
    lastSystemEventAt: string | null;
  };
  config: HealthConfig;
  checks: HealthCheck[];
}

interface HealthCountRow extends QueryResultRow {
  institutions: number | string;
  reports: number | string;
  indicators: number | string;
  exceptions: number | string;
  documents: number | string;
  chunks: number | string;
  ingestion_jobs: number | string;
  users: number | string;
  audit_events: number | string;
  system_events: number | string;
  conversations: number | string;
  messages: number | string;
  report_runs: number | string;
  latest_period: string | null;
  last_system_event_at: string | Date | null;
  last_audit_event_at: string | Date | null;
  last_ingestion_at: string | Date | null;
  pending_jobs: number | string;
  failed_jobs: number | string;
  open_exceptions: number | string;
}

interface VersionRow extends QueryResultRow {
  version: string;
  database_name: string;
}

interface DatabaseSnapshot {
  counts: TableCounts;
  latestPeriod: string | null;
  lastSystemEventAt: string | null;
  lastAuditEventAt: string | null;
  lastIngestionAt: string | null;
  pendingJobs: number;
  failedJobs: number;
  openExceptions: number;
  version: string | null;
  databaseName: string | null;
}

const COUNT_SQL = `SELECT
  (SELECT count(*)::int FROM institutions) AS institutions,
  (SELECT count(*)::int FROM institution_reports) AS reports,
  (SELECT count(*)::int FROM supervisory_indicators) AS indicators,
  (SELECT count(*)::int FROM supervisory_exceptions) AS exceptions,
  (SELECT count(*)::int FROM uploaded_documents) AS documents,
  (SELECT count(*)::int FROM document_chunks) AS chunks,
  (SELECT count(*)::int FROM ingestion_jobs) AS ingestion_jobs,
  (SELECT count(*)::int FROM users) AS users,
  (SELECT count(*)::int FROM audit_events) AS audit_events,
  (SELECT count(*)::int FROM system_events) AS system_events,
  (SELECT count(*)::int FROM conversations) AS conversations,
  (SELECT count(*)::int FROM messages) AS messages,
  (SELECT count(*)::int FROM report_runs) AS report_runs,
  (SELECT max(reporting_period) FROM institution_reports) AS latest_period,
  (SELECT max(created_at) FROM system_events) AS last_system_event_at,
  (SELECT max(happened_at) FROM audit_events) AS last_audit_event_at,
  (SELECT max(created_at) FROM ingestion_jobs) AS last_ingestion_at,
  (SELECT count(*)::int FROM ingestion_jobs WHERE status IN ('queued', 'processing')) AS pending_jobs,
  (SELECT count(*)::int FROM ingestion_jobs WHERE status = 'failed') AS failed_jobs,
  (SELECT count(*)::int FROM supervisory_exceptions WHERE status = 'open') AS open_exceptions`;

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function emptyTableCounts(): TableCounts {
  return {
    institutions: 0,
    reports: 0,
    indicators: 0,
    exceptions: 0,
    documents: 0,
    chunks: 0,
    ingestionJobs: 0,
    users: 0,
    auditEvents: 0,
    systemEvents: 0,
    conversations: 0,
    messages: 0,
    reportRuns: 0,
  };
}

function toCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function toIso(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isRemoteDatabaseUrl(databaseUrl: string | undefined): boolean {
  if (!databaseUrl) return false;
  try {
    return !LOOPBACK_HOSTS.has(new URL(databaseUrl).hostname);
  } catch {
    return false;
  }
}

export function describeHealthConfig(): HealthConfig {
  const databaseUrl = process.env.DATABASE_URL;
  const authSecret = process.env.AUTH_SECRET;
  const demoUsername = process.env.DEMO_USERNAME;
  const demoPassword = process.env.DEMO_PASSWORD;
  const demoRole = process.env.DEMO_ROLE?.trim() || 'supervisor';
  const region = process.env.AWS_REGION?.trim();
  const endpoint = process.env.AWS_ENDPOINT_URL_S3?.trim();
  const lmStudioBaseUrl = process.env.LM_STUDIO_BASE_URL?.trim();

  const missing: string[] = [];
  if (!databaseUrl) missing.push('DATABASE_URL');
  if (!authSecret) missing.push('AUTH_SECRET');
  if (!demoUsername) missing.push('DEMO_USERNAME');
  if (!demoPassword) missing.push('DEMO_PASSWORD');
  if (!region) missing.push('AWS_REGION');
  if (!endpoint) missing.push('AWS_ENDPOINT_URL_S3');
  if (!lmStudioBaseUrl) missing.push('LM_STUDIO_BASE_URL');

  return {
    databaseUrlConfigured: Boolean(databaseUrl),
    authSecretConfigured: Boolean(authSecret),
    demoUserConfigured: Boolean(demoUsername && demoPassword),
    demoRole,
    remoteDatabase: isRemoteDatabaseUrl(databaseUrl),
    s3Configured: Boolean(region && endpoint),
    lmStudioConfigured: Boolean(lmStudioBaseUrl),
    missing,
  };
}

function modelBaseUrl(): string {
  try {
    return getLocalModelBaseUrl();
  } catch {
    return process.env.LM_STUDIO_BASE_URL?.trim() || 'invalid loopback configuration';
  }
}

function emptySnapshot(): DatabaseSnapshot {
  return {
    counts: emptyTableCounts(),
    latestPeriod: null,
    lastSystemEventAt: null,
    lastAuditEventAt: null,
    lastIngestionAt: null,
    pendingJobs: 0,
    failedJobs: 0,
    openExceptions: 0,
    version: null,
    databaseName: null,
  };
}

async function loadDatabaseSnapshot(available: boolean): Promise<DatabaseSnapshot> {
  if (!available) return emptySnapshot();

  const [versionResult, countResult] = await Promise.all([
    query<VersionRow>(
      `SELECT version() AS version, current_database() AS database_name`,
    ).catch(() => null),
    query<HealthCountRow>(COUNT_SQL).catch(() => null),
  ]);

  const versionRow = versionResult?.rows[0];
  const row = countResult?.rows[0];

  return {
    counts: {
      institutions: toCount(row?.institutions),
      reports: toCount(row?.reports),
      indicators: toCount(row?.indicators),
      exceptions: toCount(row?.exceptions),
      documents: toCount(row?.documents),
      chunks: toCount(row?.chunks),
      ingestionJobs: toCount(row?.ingestion_jobs),
      users: toCount(row?.users),
      auditEvents: toCount(row?.audit_events),
      systemEvents: toCount(row?.system_events),
      conversations: toCount(row?.conversations),
      messages: toCount(row?.messages),
      reportRuns: toCount(row?.report_runs),
    },
    latestPeriod: row?.latest_period ?? null,
    lastSystemEventAt: toIso(row?.last_system_event_at),
    lastAuditEventAt: toIso(row?.last_audit_event_at),
    lastIngestionAt: toIso(row?.last_ingestion_at),
    pendingJobs: toCount(row?.pending_jobs),
    failedJobs: toCount(row?.failed_jobs),
    openExceptions: toCount(row?.open_exceptions),
    version: versionRow?.version ?? null,
    databaseName: versionRow?.database_name ?? null,
  };
}

async function describeStorage(snapshot: DatabaseSnapshot): Promise<SystemHealth['storage']> {
  const region = process.env.AWS_REGION?.trim();
  const endpoint = process.env.AWS_ENDPOINT_URL_S3?.trim();
  const bucket = process.env.AWS_S3_BUCKET?.trim() || 'uploads';

  if (region && endpoint) {
    return {
      mode: 's3',
      location: `${bucket} @ ${endpoint}`,
      writable: null,
      documents: snapshot.counts.documents,
      chunks: snapshot.counts.chunks,
      pendingJobs: snapshot.pendingJobs,
      failedJobs: snapshot.failedJobs,
      lastIngestionAt: snapshot.lastIngestionAt,
    };
  }

  const configuredDir = process.env.LOCAL_UPLOADS_DIR?.trim() || '.local/uploads';
  let writable: boolean | null = null;
  try {
    await fs.access(path.resolve(configuredDir), fs.constants.W_OK);
    writable = true;
  } catch {
    writable = false;
  }

  return {
    mode: 'local',
    location: configuredDir,
    writable,
    documents: snapshot.counts.documents,
    chunks: snapshot.counts.chunks,
    pendingJobs: snapshot.pendingJobs,
    failedJobs: snapshot.failedJobs,
    lastIngestionAt: snapshot.lastIngestionAt,
  };
}

function buildChecks(
  databaseAvailable: boolean,
  databaseLatencyMs: number | null,
  chatAvailable: boolean,
  embeddingAvailable: boolean,
  storage: SystemHealth['storage'],
  systemEvents: number,
): HealthCheck[] {
  let storageStatus: HealthCheckStatus = 'degraded';
  let storageDetail = 'Local upload directory is not writable.';
  if (storage.mode === 's3') {
    storageStatus = 'ok';
    storageDetail = 'S3-compatible object storage is configured; writes are not probed.';
  } else if (storage.writable === true) {
    storageStatus = 'ok';
    storageDetail = 'Local upload directory is writable.';
  }

  return [
    {
      name: 'Database',
      status: databaseAvailable ? 'ok' : 'unavailable',
      detail: databaseAvailable
        ? 'PostgreSQL accepted a probe query.'
        : 'The configured database could not be reached.',
      latencyMs: databaseLatencyMs ?? undefined,
    },
    {
      name: 'Chat model',
      status: chatAvailable ? 'ok' : 'unavailable',
      detail: chatAvailable
        ? 'A local chat model is listed by the loopback endpoint.'
        : 'No local chat model responded on the loopback endpoint.',
    },
    {
      name: 'Embeddings',
      status: embeddingAvailable ? 'ok' : 'unavailable',
      detail: embeddingAvailable
        ? 'A local embedding model is listed by the loopback endpoint.'
        : 'No local embedding model responded on the loopback endpoint.',
    },
    {
      name: 'Upload storage',
      status: storageStatus,
      detail: storageDetail,
    },
    {
      name: 'Event stream',
      status: databaseAvailable ? 'ok' : 'unavailable',
      detail: databaseAvailable
        ? `${systemEvents.toLocaleString('en')} system event(s) recorded.`
        : 'Event stream state requires the database.',
    },
    {
      name: 'External BoT integration',
      status: 'degraded',
      detail: 'Not connected by design',
    },
  ];
}

export async function getSystemHealth(): Promise<SystemHealth> {
  const config = describeHealthConfig();
  const startedAt = Date.now();

  let databaseAvailable = false;
  let databaseLatencyMs: number | null = null;
  try {
    await query('SELECT 1');
    databaseAvailable = true;
    databaseLatencyMs = Date.now() - startedAt;
  } catch {
    databaseAvailable = false;
    databaseLatencyMs = null;
  }

  const [snapshot, chatAvailable, embeddingAvailable] = await Promise.all([
    loadDatabaseSnapshot(databaseAvailable),
    isLocalChatModelAvailable(),
    isLocalEmbeddingModelAvailable(),
  ]);
  const storage = await describeStorage(snapshot);
  const checks = buildChecks(
    databaseAvailable,
    databaseLatencyMs,
    chatAvailable,
    embeddingAvailable,
    storage,
    snapshot.counts.systemEvents,
  );

  return {
    checkedAt: new Date().toISOString(),
    database: {
      available: databaseAvailable,
      latencyMs: databaseLatencyMs,
      version: snapshot.version,
      databaseName: snapshot.databaseName,
      tableCounts: snapshot.counts,
      latestPeriod: snapshot.latestPeriod,
      lastSystemEventAt: snapshot.lastSystemEventAt,
      lastAuditEventAt: snapshot.lastAuditEventAt,
    },
    model: {
      chatAvailable,
      embeddingAvailable,
      baseUrl: modelBaseUrl(),
      chatModel: process.env.LM_STUDIO_CHAT_MODEL?.trim() || 'qwen/qwen3.6-35b-a3b',
      embeddingModel:
        process.env.LM_STUDIO_EMBEDDING_MODEL?.trim() ||
        'text-embedding-nomic-embed-text-v1.5',
    },
    storage,
    data: {
      ...snapshot.counts,
      openExceptions: snapshot.openExceptions,
    },
    events: {
      systemEvents: snapshot.counts.systemEvents,
      auditEvents: snapshot.counts.auditEvents,
      lastSystemEventAt: snapshot.lastSystemEventAt,
    },
    config,
    checks,
  };
}

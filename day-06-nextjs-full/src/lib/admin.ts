import type { QueryResultRow } from 'pg';
import { query } from './db';
import { describeHealthConfig, type HealthConfig } from './health';

export interface AdminUser {
  userId: string;
  roleId: string;
  roleLabel: string;
  enabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AdminRole {
  roleId: string;
  label: string;
  permissions: string[];
}

export interface AdminThreshold {
  thresholdId: string;
  indicatorId: string;
  label: string;
  operator: string;
  value: number;
  severity: string;
  rationale: string;
  enabled: boolean;
  training: boolean;
}

export interface AdminIndicator {
  indicatorId: string;
  label: string;
  unit: string;
  formula: string;
  description: string;
}

export interface AdminAuditEvent {
  id: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  details: unknown;
  happenedAt: string;
}

export interface AdminSystemEvent {
  id: string;
  eventType: string;
  payload: unknown;
  createdAt: string;
}

export interface AdminReportRun {
  id: string;
  status: string;
  resultCount: number;
  createdBy: string;
  createdAt: string;
  filters: unknown;
}

export interface AdminCounts {
  users: number;
  conversations: number;
  messages: number;
  reportRuns: number;
  documents: number;
  chunks: number;
  ingestionJobs: number;
  auditEvents: number;
  systemEvents: number;
}

export interface AdminOverview {
  users: AdminUser[];
  roles: AdminRole[];
  thresholds: AdminThreshold[];
  indicators: AdminIndicator[];
  auditEvents: AdminAuditEvent[];
  systemEvents: AdminSystemEvent[];
  reportRuns: AdminReportRun[];
  counts: AdminCounts;
  config: HealthConfig;
}

interface UserRow extends QueryResultRow {
  user_id: string;
  role_id: string;
  role_label: string | null;
  enabled: boolean;
  created_at: string | Date;
  last_login_at: string | Date | null;
}

interface RoleRow extends QueryResultRow {
  role_id: string;
  label: string;
  permissions: string[] | null;
}

interface ThresholdRow extends QueryResultRow {
  threshold_id: string;
  indicator_id: string;
  label: string;
  operator: string;
  threshold_value: number | string;
  severity: string;
  rationale: string;
  enabled: boolean;
  is_training_configuration: boolean;
}

interface IndicatorRow extends QueryResultRow {
  indicator_id: string;
  label: string;
  unit: string;
  formula: string;
  description: string;
}

interface AuditRow extends QueryResultRow {
  audit_event_id: string | number;
  actor_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: unknown;
  happened_at: string | Date;
}

interface SystemEventRow extends QueryResultRow {
  event_id: string | number;
  event_type: string;
  payload: unknown;
  created_at: string | Date;
}

interface ReportRunRow extends QueryResultRow {
  report_run_id: string;
  status: string;
  result_count: number | string;
  created_by: string;
  created_at: string | Date;
  filters: unknown;
}

interface CountRow extends QueryResultRow {
  users: number | string;
  conversations: number | string;
  messages: number | string;
  report_runs: number | string;
  documents: number | string;
  chunks: number | string;
  ingestion_jobs: number | string;
  audit_events: number | string;
  system_events: number | string;
}

function toCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function toIso(value: string | Date): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function toIsoOrNull(value: string | Date | null): string | null {
  return value === null || value === undefined ? null : toIso(value);
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const [
    userResult,
    roleResult,
    thresholdResult,
    indicatorResult,
    auditResult,
    systemEventResult,
    reportRunResult,
    countResult,
  ] = await Promise.all([
    query<UserRow>(
      `SELECT u.user_id, u.role_id, r.label AS role_label, u.enabled,
         u.created_at, u.last_login_at
       FROM users u
       LEFT JOIN roles r ON r.role_id = u.role_id
       ORDER BY u.user_id
       LIMIT 100`,
    ),
    query<RoleRow>(
      `SELECT r.role_id, r.label,
         COALESCE(
           array_agg(rp.permission_id ORDER BY rp.permission_id)
             FILTER (WHERE rp.permission_id IS NOT NULL),
           '{}'
         ) AS permissions
       FROM roles r
       LEFT JOIN role_permissions rp ON rp.role_id = r.role_id
       GROUP BY r.role_id, r.label
       ORDER BY r.role_id`,
    ),
    query<ThresholdRow>(
      `SELECT threshold_id, indicator_id, label, operator, threshold_value,
         severity, rationale, enabled, is_training_configuration
       FROM threshold_configurations
       ORDER BY threshold_id
       LIMIT 100`,
    ),
    query<IndicatorRow>(
      `SELECT indicator_id, label, unit, formula, description
       FROM indicator_definitions
       ORDER BY indicator_id
       LIMIT 100`,
    ),
    query<AuditRow>(
      `SELECT audit_event_id, actor_id, action, entity_type, entity_id,
         details, happened_at
       FROM audit_events
       ORDER BY happened_at DESC, audit_event_id DESC
       LIMIT 15`,
    ),
    query<SystemEventRow>(
      `SELECT event_id, event_type, payload, created_at
       FROM system_events
       ORDER BY event_id DESC
       LIMIT 15`,
    ),
    query<ReportRunRow>(
      `SELECT report_run_id, status, result_count, created_by, created_at, filters
       FROM report_runs
       ORDER BY created_at DESC
       LIMIT 10`,
    ),
    query<CountRow>(
      `SELECT
         (SELECT count(*)::int FROM users) AS users,
         (SELECT count(*)::int FROM conversations) AS conversations,
         (SELECT count(*)::int FROM messages) AS messages,
         (SELECT count(*)::int FROM report_runs) AS report_runs,
         (SELECT count(*)::int FROM uploaded_documents) AS documents,
         (SELECT count(*)::int FROM document_chunks) AS chunks,
         (SELECT count(*)::int FROM ingestion_jobs) AS ingestion_jobs,
         (SELECT count(*)::int FROM audit_events) AS audit_events,
         (SELECT count(*)::int FROM system_events) AS system_events`,
    ),
  ]);

  const counts = countResult.rows[0];

  return {
    users: userResult.rows.map((row) => ({
      userId: row.user_id,
      roleId: row.role_id,
      roleLabel: row.role_label ?? row.role_id,
      enabled: row.enabled,
      createdAt: toIso(row.created_at),
      lastLoginAt: toIsoOrNull(row.last_login_at),
    })),
    roles: roleResult.rows.map((row) => ({
      roleId: row.role_id,
      label: row.label,
      permissions: row.permissions ?? [],
    })),
    thresholds: thresholdResult.rows.map((row) => ({
      thresholdId: row.threshold_id,
      indicatorId: row.indicator_id,
      label: row.label,
      operator: row.operator,
      value: Number(row.threshold_value),
      severity: row.severity,
      rationale: row.rationale,
      enabled: row.enabled,
      training: row.is_training_configuration,
    })),
    indicators: indicatorResult.rows.map((row) => ({
      indicatorId: row.indicator_id,
      label: row.label,
      unit: row.unit,
      formula: row.formula,
      description: row.description,
    })),
    auditEvents: auditResult.rows.map((row) => ({
      id: String(row.audit_event_id),
      actorId: row.actor_id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      details: row.details,
      happenedAt: toIso(row.happened_at),
    })),
    systemEvents: systemEventResult.rows.map((row) => ({
      id: String(row.event_id),
      eventType: row.event_type,
      payload: row.payload,
      createdAt: toIso(row.created_at),
    })),
    reportRuns: reportRunResult.rows.map((row) => ({
      id: row.report_run_id,
      status: row.status,
      resultCount: toCount(row.result_count),
      createdBy: row.created_by,
      createdAt: toIso(row.created_at),
      filters: row.filters,
    })),
    counts: {
      users: toCount(counts?.users),
      conversations: toCount(counts?.conversations),
      messages: toCount(counts?.messages),
      reportRuns: toCount(counts?.report_runs),
      documents: toCount(counts?.documents),
      chunks: toCount(counts?.chunks),
      ingestionJobs: toCount(counts?.ingestion_jobs),
      auditEvents: toCount(counts?.audit_events),
      systemEvents: toCount(counts?.system_events),
    },
    config: describeHealthConfig(),
  };
}

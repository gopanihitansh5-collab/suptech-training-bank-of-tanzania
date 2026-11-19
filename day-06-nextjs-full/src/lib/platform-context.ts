import { query } from './db';

export interface PlatformContextStats {
  institutions: number;
  reports: number;
  indicators: number;
  exceptions: number;
  openExceptions: number;
  documents: number;
  chunks: number;
  latestPeriod: string | null;
  latestIngestionStatus: string | null;
  periods: string[];
}

export interface PlatformContext {
  generatedAt: string;
  stats: PlatformContextStats;
  text: string;
}

const CONTEXT_TTL_MS = 60_000;
const MAX_CONTEXT_CHARS = 6_000;
const GUARDRAILS =
  'Guardrails: synthetic data only; thresholds are training values; exceptions are review signals, not official findings or determinations of misconduct.';

let cached: { value: PlatformContext; expiresAt: number } | null = null;

function toCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function toText(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat('en').format(value);
}

function formatNumber(value: number | null): string {
  if (value === null) return 'not available';
  return new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(value);
}

function clean(value: string, maxLength = 220): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1).trimEnd()}…`
    : normalized;
}

function emptyStats(): PlatformContextStats {
  return {
    institutions: 0,
    reports: 0,
    indicators: 0,
    exceptions: 0,
    openExceptions: 0,
    documents: 0,
    chunks: 0,
    latestPeriod: null,
    latestIngestionStatus: null,
    periods: [],
  };
}

function minimalContext(note: string): PlatformContext {
  return {
    generatedAt: new Date().toISOString(),
    stats: emptyStats(),
    text: `Dataset: platform context unavailable. ${note}\n${GUARDRAILS}`,
  };
}

async function buildPlatformContext(): Promise<PlatformContext> {
  const [
    countResult,
    periodResult,
    institutionResult,
    indicatorResult,
    thresholdResult,
    severityResult,
    statusResult,
    openExceptionResult,
    ingestionResult,
  ] = await Promise.all([
    query<{
      institutions: number;
      reports: number;
      indicators: number;
      exceptions: number;
      open_exceptions: number;
      documents: number;
      chunks: number;
      latest_period: string | null;
    }>(
      `SELECT
         (SELECT count(*)::int FROM institutions) AS institutions,
         (SELECT count(*)::int FROM institution_reports) AS reports,
         (SELECT count(*)::int FROM supervisory_indicators) AS indicators,
         (SELECT count(*)::int FROM supervisory_exceptions) AS exceptions,
         (SELECT count(*)::int FROM supervisory_exceptions WHERE status = 'open') AS open_exceptions,
         (SELECT count(*)::int FROM uploaded_documents) AS documents,
         (SELECT count(*)::int FROM document_chunks) AS chunks,
         (SELECT max(reporting_period) FROM institution_reports) AS latest_period`,
    ),
    query<{ reporting_period: string }>(
      `SELECT DISTINCT reporting_period
       FROM institution_reports
       ORDER BY reporting_period DESC
       LIMIT 12`,
    ),
    query<{
      institution_id: string;
      institution_name: string;
      institution_type: string;
      region: string;
      tier: string;
      status: string;
    }>(
      `SELECT institution_id, institution_name, institution_type, region, tier, status
       FROM institutions
       ORDER BY institution_id
       LIMIT 60`,
    ),
    query<{
      indicator_id: string;
      label: string;
      unit: string;
      formula: string;
    }>(
      `SELECT indicator_id, label, unit, formula
       FROM indicator_definitions
       ORDER BY indicator_id
       LIMIT 40`,
    ),
    query<{
      indicator_id: string;
      operator: string;
      threshold_value: number;
      severity: string;
      label: string;
    }>(
      `SELECT indicator_id, operator, threshold_value, severity, label
       FROM threshold_configurations
       WHERE enabled
       ORDER BY severity, indicator_id
       LIMIT 40`,
    ),
    query<{ severity: string; count: number }>(
      `SELECT severity, count(*)::int AS count
       FROM supervisory_exceptions
       GROUP BY severity
       ORDER BY severity`,
    ),
    query<{ status: string; count: number }>(
      `SELECT status, count(*)::int AS count
       FROM supervisory_exceptions
       GROUP BY status
       ORDER BY status`,
    ),
    query<{
      institution_id: string;
      institution_name: string;
      indicator_id: string;
      reporting_period: string;
      observed_value: number;
      threshold_value: number;
      severity: string;
      message: string;
    }>(
      `SELECT e.institution_id, i.institution_name, e.indicator_id,
         e.reporting_period, e.observed_value, e.threshold_value, e.severity, e.message
       FROM supervisory_exceptions e
       JOIN institutions i USING (institution_id)
       WHERE e.status = 'open'
       ORDER BY CASE e.severity
         WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         e.reporting_period DESC
       LIMIT 5`,
    ),
    query<{ latest_ingestion_status: string | null; latest_document_at: string | null }>(
      `SELECT
         (SELECT status FROM ingestion_jobs ORDER BY created_at DESC LIMIT 1) AS latest_ingestion_status,
         (SELECT max(created_at) FROM uploaded_documents) AS latest_document_at`,
    ),
  ]);

  const counts = countResult.rows[0];
  const stats: PlatformContextStats = {
    institutions: toCount(counts?.institutions),
    reports: toCount(counts?.reports),
    indicators: toCount(counts?.indicators),
    exceptions: toCount(counts?.exceptions),
    openExceptions: toCount(counts?.open_exceptions),
    documents: toCount(counts?.documents),
    chunks: toCount(counts?.chunks),
    latestPeriod: counts?.latest_period ?? null,
    latestIngestionStatus: ingestionResult.rows[0]?.latest_ingestion_status ?? null,
    periods: periodResult.rows
      .map((row) => row.reporting_period)
      .filter((value): value is string => typeof value === 'string')
      .reverse(),
  };

  const lines: string[] = [];
  lines.push('Dataset');
  lines.push(
    `- ${formatCount(stats.institutions)} institutions, ${formatCount(stats.reports)} reports, ${formatCount(stats.indicators)} persisted indicators, ${formatCount(stats.exceptions)} exceptions (${formatCount(stats.openExceptions)} open), ${formatCount(stats.documents)} documents and ${formatCount(stats.chunks)} chunks.`,
  );

  lines.push('Periods');
  lines.push(`- Latest period: ${stats.latestPeriod ?? 'not available'}`);
  lines.push(
    `- Last ${stats.periods.length} distinct period(s): ${stats.periods.join(', ') || 'not available'}`,
  );

  lines.push('Institutions');
  if (institutionResult.rows.length === 0) {
    lines.push('- No synthetic institutions are recorded.');
  } else {
    for (const row of institutionResult.rows) {
      lines.push(
        `- ${toText(row.institution_id)} | ${toText(row.institution_name)} | ${toText(row.institution_type)} | ${toText(row.region)} | ${toText(row.tier)} | ${toText(row.status)}`,
      );
    }
  }

  lines.push('Indicators');
  if (indicatorResult.rows.length === 0) {
    lines.push('- No indicator definitions are recorded.');
  } else {
    for (const row of indicatorResult.rows) {
      lines.push(
        `- ${toText(row.indicator_id)} | ${toText(row.label)} | ${toText(row.unit)} | ${clean(toText(row.formula), 120)}`,
      );
    }
  }

  lines.push('Training thresholds');
  if (thresholdResult.rows.length === 0) {
    lines.push('- No training threshold configurations are recorded.');
  } else {
    for (const row of thresholdResult.rows) {
      lines.push(
        `- ${toText(row.indicator_id)} ${toText(row.operator)} ${formatNumber(toNumber(row.threshold_value))} (${toText(row.severity)}) | ${toText(row.label)}`,
      );
    }
  }

  const severityCounts = severityResult.rows
    .map((row) => `${toText(row.severity, 'unknown')} ${toCount(row.count)}`)
    .join(', ');
  const statusCounts = statusResult.rows
    .map((row) => `${toText(row.status, 'unknown')} ${toCount(row.count)}`)
    .join(', ');
  lines.push('Exception summary');
  lines.push(`- By severity: ${severityCounts || 'none recorded'}`);
  lines.push(`- By status: ${statusCounts || 'none recorded'}`);

  lines.push('Top open signals');
  if (openExceptionResult.rows.length === 0) {
    lines.push('- No open review signals are recorded.');
  } else {
    for (const row of openExceptionResult.rows) {
      lines.push(
        `- ${toText(row.institution_name)} (${toText(row.institution_id)}) | ${toText(row.indicator_id)} | ${toText(row.reporting_period)} | observed ${formatNumber(toNumber(row.observed_value))} vs threshold ${formatNumber(toNumber(row.threshold_value))} | ${toText(row.severity)} | ${clean(toText(row.message))}`,
      );
    }
  }

  lines.push('Documents');
  lines.push(`- Uploaded documents: ${formatCount(stats.documents)}; chunks: ${formatCount(stats.chunks)}`);
  lines.push(
    `- Latest ingestion status: ${stats.latestIngestionStatus ?? 'none recorded'}; latest document: ${toText(ingestionResult.rows[0]?.latest_document_at, 'not available')}`,
  );

  const body = lines.join('\n');
  const maxBody = MAX_CONTEXT_CHARS - GUARDRAILS.length - 2;
  const trimmedBody =
    body.length > maxBody
      ? `${body.slice(0, Math.max(0, maxBody - 1)).trimEnd()}…`
      : body;

  return {
    generatedAt: new Date().toISOString(),
    stats,
    text: `${trimmedBody}\n${GUARDRAILS}`.slice(0, MAX_CONTEXT_CHARS),
  };
}

export function clearPlatformContextCache(): void {
  cached = null;
}

export async function getPlatformContext(): Promise<PlatformContext> {
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  try {
    const value = await buildPlatformContext();
    cached = { value, expiresAt: Date.now() + CONTEXT_TTL_MS };
    return value;
  } catch {
    const value = minimalContext(
      'Database reads failed, so only supplied evidence and prior tool output should be used.',
    );
    cached = { value, expiresAt: Date.now() + CONTEXT_TTL_MS };
    return value;
  }
}

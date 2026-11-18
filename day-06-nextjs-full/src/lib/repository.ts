import type { QueryResultRow } from 'pg';
import { NotFoundError, RequestValidationError } from './api-errors';
import { INDICATOR_DEFINITIONS } from './catalog';
import { query } from './db';

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface InstitutionRow {
  institutionId: string;
  name: string;
  type: string;
  region: string;
  tier: string;
  status: string;
  latestPeriod: string | null;
  depositsTzsBillions: number | null;
  capitalAdequacyRatioPercent: number | null;
  nplRatioPercent: number | null;
  openExceptions: number;
}

export interface ExceptionRow {
  id: string;
  institutionId: string;
  institutionName: string;
  reportId: string;
  period: string;
  indicatorId: string;
  observedValue: number;
  thresholdValue: number;
  severity: string;
  status: string;
  message: string;
  createdAt: string;
}

export interface ReportRow {
  reportId: string;
  institutionId: string;
  institutionName: string;
  period: string;
  submittedAt: string;
  completenessPercent: number;
}

export interface OverviewData {
  period: string | null;
  summary: {
    institutions: number;
    reportsReceived: number;
    reportsExpected: number;
    openExceptions: number;
    criticalExceptions: number;
    depositsTzsBillions: number;
    loansTzsBillions: number;
    completenessPercent: number | null;
  };
  trend: Array<{
    period: string;
    depositsTzsBillions: number;
    loansTzsBillions: number;
    completenessPercent: number | null;
    exceptions: number;
  }>;
  recentExceptions: ExceptionRow[];
}

export interface DataExplorerStats {
  institutions: number;
  reports: number;
  indicators: number;
  reviewSignals: number;
  latestPeriod: string | null;
}

export interface InstitutionDetail {
  institution: InstitutionRow;
  reports: Array<{
    reportId: string;
    period: string;
    depositsTzsBillions: number;
    loansTzsBillions: number;
    capitalAdequacyRatioPercent: number;
    liquidityRatioPercent: number;
    nplRatioPercent: number;
    completenessPercent: number;
    sourceRecordIds: string[];
  }>;
  exceptions: ExceptionRow[];
}

export interface ExceptionFilters {
  search?: string;
  institutionId?: string;
  period?: string;
  severity?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface InstitutionFilters {
  search?: string;
  region?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface ReportFilters {
  search?: string;
  institutionId?: string;
  period?: string;
  page?: number;
  pageSize?: number;
}

function numeric(value: string | number | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function numericValue(value: string | number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error('Database returned a non-numeric value for a numeric field.');
  }
  return parsed;
}

function normalizePeriod(period: string | undefined): string | undefined {
  if (period === undefined || period === '') return undefined;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    throw new RequestValidationError('Reporting period must use YYYY-MM format.');
  }
  return period;
}

function pagination(page = 1, pageSize = 25): { page: number; pageSize: number; offset: number } {
  if (!Number.isSafeInteger(page) || page < 1) {
    throw new RequestValidationError('Page must be a positive integer.');
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throw new RequestValidationError('Page size must be between 1 and 50.');
  }
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$1');
}

function mapException(row: QueryResultRow): ExceptionRow {
  return {
    id: row.exception_id,
    institutionId: row.institution_id,
    institutionName: row.institution_name,
    reportId: row.report_id,
    period: row.reporting_period,
    indicatorId: row.indicator_id,
    observedValue: numericValue(row.observed_value),
    thresholdValue: numericValue(row.threshold_value),
    severity: row.severity,
    status: row.status,
    message: row.message,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function getOverview(requestedPeriod?: string): Promise<OverviewData> {
  const periodFilter = normalizePeriod(requestedPeriod) ?? null;
  const periodResult = await query<{ period: string | null }>(
    `SELECT COALESCE($1::text, MAX(reporting_period)) AS period
     FROM institution_reports`,
    [periodFilter],
  );
  const period = periodResult.rows[0]?.period ?? null;
  const emptySummary = {
    institutions: 0,
    reportsReceived: 0,
    reportsExpected: 0,
    openExceptions: 0,
    criticalExceptions: 0,
    depositsTzsBillions: 0,
    loansTzsBillions: 0,
    completenessPercent: null,
  };
  if (!period) {
    return { period: null, summary: emptySummary, trend: [], recentExceptions: [] };
  }

  const summaryResult = await query(
    `SELECT
       (SELECT count(*)::int FROM institutions) AS institutions,
       (SELECT count(DISTINCT institution_id)::int FROM institution_reports
        WHERE reporting_period = $1) AS reports_received,
       (SELECT count(*)::int FROM institutions) AS reports_expected,
       (SELECT COALESCE(sum(deposits_tzs_billions), 0)::float8
        FROM institution_reports WHERE reporting_period = $1) AS deposits,
       (SELECT COALESCE(sum(loans_tzs_billions), 0)::float8
        FROM institution_reports WHERE reporting_period = $1) AS loans,
       (SELECT avg(report_completeness_percent)::float8
        FROM institution_reports WHERE reporting_period = $1) AS completeness,
       (SELECT count(*)::int FROM supervisory_exceptions
        WHERE reporting_period = $1 AND status = 'open') AS open_exceptions,
       (SELECT count(*)::int FROM supervisory_exceptions
        WHERE reporting_period = $1 AND status = 'open' AND severity = 'critical')
        AS critical_exceptions`,
    [period],
  );
  const summary = summaryResult.rows[0];

  const trendResult = await query(
    `WITH period_list AS (
       SELECT reporting_period
       FROM institution_reports
       WHERE reporting_period <= $1
       GROUP BY reporting_period
       ORDER BY reporting_period DESC
       LIMIT 12
     ),
     report_totals AS (
       SELECT r.reporting_period,
         sum(r.deposits_tzs_billions)::float8 AS deposits,
         sum(r.loans_tzs_billions)::float8 AS loans,
         avg(r.report_completeness_percent)::float8 AS completeness
       FROM institution_reports r
       JOIN period_list p USING (reporting_period)
       GROUP BY r.reporting_period
     ),
     exception_totals AS (
       SELECT e.reporting_period, count(*)::int AS exceptions
       FROM supervisory_exceptions e
       JOIN period_list p USING (reporting_period)
       WHERE e.status != 'resolved'
       GROUP BY e.reporting_period
     )
     SELECT p.reporting_period AS period,
       rt.deposits,
       rt.loans,
       rt.completeness,
       COALESCE(et.exceptions, 0)::int AS exceptions
     FROM period_list p
     JOIN report_totals rt USING (reporting_period)
     LEFT JOIN exception_totals et USING (reporting_period)
     ORDER BY p.reporting_period ASC`,
    [period],
  );

  const exceptionResult = await query(
    `SELECT e.*, i.institution_name
     FROM supervisory_exceptions e
     JOIN institutions i USING (institution_id)
     WHERE e.reporting_period = $1 AND e.status = 'open'
     ORDER BY CASE e.severity
       WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
       e.created_at DESC
     LIMIT 6`,
    [period],
  );

  return {
    period,
    summary: {
      institutions: numericValue(summary.institutions),
      reportsReceived: numericValue(summary.reports_received),
      reportsExpected: numericValue(summary.reports_expected),
      openExceptions: numericValue(summary.open_exceptions),
      criticalExceptions: numericValue(summary.critical_exceptions),
      depositsTzsBillions: numericValue(summary.deposits),
      loansTzsBillions: numericValue(summary.loans),
      completenessPercent: numeric(summary.completeness),
    },
    trend: trendResult.rows.map((row) => ({
      period: row.period,
      depositsTzsBillions: numericValue(row.deposits),
      loansTzsBillions: numericValue(row.loans),
      completenessPercent: numeric(row.completeness),
      exceptions: numericValue(row.exceptions),
    })),
    recentExceptions: exceptionResult.rows.map(mapException),
  };
}

export async function getDataExplorerStats(): Promise<DataExplorerStats> {
  const result = await query<{
    institutions: number;
    reports: number;
    indicators: number;
    review_signals: number;
    latest_period: string | null;
  }>(
    `SELECT
       (SELECT count(*)::int FROM institutions) AS institutions,
       (SELECT count(*)::int FROM institution_reports) AS reports,
       (SELECT count(*)::int FROM supervisory_indicators) AS indicators,
       (SELECT count(*)::int FROM supervisory_exceptions) AS review_signals,
       (SELECT max(reporting_period) FROM institution_reports) AS latest_period`,
  );
  const stats = result.rows[0];
  if (!stats) {
    throw new Error('The data explorer summary query returned no result.');
  }
  return {
    institutions: Number(stats.institutions),
    reports: Number(stats.reports),
    indicators: Number(stats.indicators),
    reviewSignals: Number(stats.review_signals),
    latestPeriod: stats.latest_period,
  };
}

export async function listInstitutions(
  filters: InstitutionFilters = {},
): Promise<Page<InstitutionRow>> {
  const { page, pageSize, offset } = pagination(filters.page, filters.pageSize);
  const search = filters.search?.trim() ?? '';
  const region = filters.region?.trim() ?? '';
  const status = filters.status?.trim() ?? '';
  if (status && !['active', 'monitoring'].includes(status)) {
    throw new RequestValidationError('Status must be active or monitoring.');
  }
  const values = [`%${escapeLike(search)}%`, region, status];

  const countResult = await query<{ total: number }>(
    `SELECT count(*)::int AS total
     FROM institutions i
     WHERE ($1 = '%%' OR i.institution_id ILIKE $1 OR i.institution_name ILIKE $1)
       AND ($2 = '' OR i.region = $2)
       AND ($3 = '' OR i.status = $3)`,
    values,
  );
  const total = numericValue(countResult.rows[0].total);
  const result = await query(
    `SELECT i.institution_id, i.institution_name, i.institution_type, i.region,
       i.tier, i.status, latest.reporting_period AS latest_period,
       latest.deposits_tzs_billions, latest.capital_adequacy_ratio_percent,
       latest.npl_ratio_percent, COALESCE(ex.open_exceptions, 0)::int AS open_exceptions
     FROM institutions i
     LEFT JOIN LATERAL (
       SELECT reporting_period, deposits_tzs_billions,
         capital_adequacy_ratio_percent, npl_ratio_percent
       FROM institution_reports
       WHERE institution_id = i.institution_id
       ORDER BY reporting_period DESC LIMIT 1
     ) latest ON true
     LEFT JOIN LATERAL (
       SELECT count(*)::int AS open_exceptions
       FROM supervisory_exceptions
       WHERE institution_id = i.institution_id AND status != 'resolved'
     ) ex ON true
     WHERE ($1 = '%%' OR i.institution_id ILIKE $1 OR i.institution_name ILIKE $1)
       AND ($2 = '' OR i.region = $2)
       AND ($3 = '' OR i.status = $3)
     ORDER BY i.institution_id
     LIMIT $4 OFFSET $5`,
    [...values, pageSize, offset],
  );

  return {
    items: result.rows.map((row) => ({
      institutionId: row.institution_id,
      name: row.institution_name,
      type: row.institution_type,
      region: row.region,
      tier: row.tier,
      status: row.status,
      latestPeriod: row.latest_period,
      depositsTzsBillions: numeric(row.deposits_tzs_billions),
      capitalAdequacyRatioPercent: numeric(row.capital_adequacy_ratio_percent),
      nplRatioPercent: numeric(row.npl_ratio_percent),
      openExceptions: numericValue(row.open_exceptions),
    })),
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getInstitutionDetail(
  institutionId: string,
): Promise<InstitutionDetail> {
  if (!/^[A-Z0-9-]{2,24}$/i.test(institutionId)) {
    throw new RequestValidationError('Institution identifier has an invalid format.');
  }
  const institutionResult = await query(
    `SELECT i.institution_id, i.institution_name, i.institution_type, i.region,
       i.tier, i.status, latest.reporting_period AS latest_period,
       latest.deposits_tzs_billions, latest.capital_adequacy_ratio_percent,
       latest.npl_ratio_percent, COALESCE(ex.open_exceptions, 0)::int AS open_exceptions
     FROM institutions i
     LEFT JOIN LATERAL (
       SELECT reporting_period, deposits_tzs_billions,
         capital_adequacy_ratio_percent, npl_ratio_percent
       FROM institution_reports
       WHERE institution_id = i.institution_id
       ORDER BY reporting_period DESC LIMIT 1
     ) latest ON true
     LEFT JOIN LATERAL (
       SELECT count(*)::int AS open_exceptions
       FROM supervisory_exceptions
       WHERE institution_id = i.institution_id AND status != 'resolved'
     ) ex ON true
     WHERE i.institution_id = $1`,
    [institutionId.toUpperCase()],
  );
  const row = institutionResult.rows[0];
  if (!row) throw new NotFoundError('Institution was not found.');
  const institution: InstitutionRow = {
    institutionId: row.institution_id,
    name: row.institution_name,
    type: row.institution_type,
    region: row.region,
    tier: row.tier,
    status: row.status,
    latestPeriod: row.latest_period,
    depositsTzsBillions: numeric(row.deposits_tzs_billions),
    capitalAdequacyRatioPercent: numeric(row.capital_adequacy_ratio_percent),
    nplRatioPercent: numeric(row.npl_ratio_percent),
    openExceptions: numericValue(row.open_exceptions),
  };

  const [reports, exceptions] = await Promise.all([
    query(
      `SELECT report_id, reporting_period, deposits_tzs_billions, loans_tzs_billions,
         capital_adequacy_ratio_percent, liquidity_ratio_percent, npl_ratio_percent,
         report_completeness_percent, source_record_ids
       FROM institution_reports
       WHERE institution_id = $1
       ORDER BY reporting_period DESC
       LIMIT 12`,
      [institution.institutionId],
    ),
    query(
      `SELECT e.*, i.institution_name
       FROM supervisory_exceptions e
       JOIN institutions i USING (institution_id)
       WHERE e.institution_id = $1
       ORDER BY e.reporting_period DESC, e.created_at DESC
       LIMIT 20`,
      [institution.institutionId],
    ),
  ]);

  return {
    institution,
    reports: reports.rows.map((row) => ({
      reportId: row.report_id,
      period: row.reporting_period,
      depositsTzsBillions: numericValue(row.deposits_tzs_billions),
      loansTzsBillions: numericValue(row.loans_tzs_billions),
      capitalAdequacyRatioPercent: numericValue(row.capital_adequacy_ratio_percent),
      liquidityRatioPercent: numericValue(row.liquidity_ratio_percent),
      nplRatioPercent: numericValue(row.npl_ratio_percent),
      completenessPercent: numericValue(row.report_completeness_percent),
      sourceRecordIds: row.source_record_ids,
    })),
    exceptions: exceptions.rows.map(mapException),
  };
}

export async function listReports(
  filters: ReportFilters = {},
): Promise<Page<ReportRow>> {
  const { page, pageSize, offset } = pagination(filters.page, filters.pageSize);
  const clauses: string[] = [];
  const values: unknown[] = [];
  const add = (clause: (parameter: string) => string, value: unknown): void => {
    values.push(value);
    clauses.push(clause(`$${values.length}`));
  };

  if (filters.search?.trim()) {
    const search = filters.search.trim();
    if (search.length > 100) {
      throw new RequestValidationError('Search must be 100 characters or fewer.');
    }
    add(
      (parameter) => `(r.report_id ILIKE ${parameter} OR i.institution_id ILIKE ${parameter} OR i.institution_name ILIKE ${parameter})`,
      `%${escapeLike(search)}%`,
    );
  }
  if (filters.institutionId?.trim()) {
    const institutionId = filters.institutionId.trim();
    if (!/^[A-Z0-9-]{2,24}$/i.test(institutionId)) {
      throw new RequestValidationError('Institution identifier has an invalid format.');
    }
    add((parameter) => `r.institution_id = ${parameter}`, institutionId.toUpperCase());
  }
  const period = normalizePeriod(filters.period);
  if (period) add((parameter) => `r.reporting_period = ${parameter}`, period);

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const countResult = await query<{ total: number }>(
    `SELECT count(*)::int AS total
     FROM institution_reports r
     JOIN institutions i USING (institution_id)
     ${where}`,
    values,
  );
  const total = numericValue(countResult.rows[0].total);
  const result = await query(
    `SELECT r.report_id, r.institution_id, i.institution_name,
       r.reporting_period, r.submitted_at, r.report_completeness_percent
     FROM institution_reports r
     JOIN institutions i USING (institution_id)
     ${where}
     ORDER BY r.reporting_period DESC, r.institution_id
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, pageSize, offset],
  );

  return {
    items: result.rows.map((row) => ({
      reportId: row.report_id,
      institutionId: row.institution_id,
      institutionName: row.institution_name,
      period: row.reporting_period,
      submittedAt: new Date(row.submitted_at).toISOString(),
      completenessPercent: numericValue(row.report_completeness_percent),
    })),
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function listExceptions(
  filters: ExceptionFilters = {},
): Promise<Page<ExceptionRow>> {
  const { page, pageSize, offset } = pagination(filters.page, filters.pageSize);
  const clauses: string[] = [];
  const values: unknown[] = [];
  const add = (clause: (parameter: string) => string, value: unknown): void => {
    values.push(value);
    clauses.push(clause(`$${values.length}`));
  };

  if (filters.search?.trim()) {
    const search = filters.search.trim();
    if (search.length > 100) {
      throw new RequestValidationError('Search must be 100 characters or fewer.');
    }
    add((p) => `(e.exception_id ILIKE ${p} OR i.institution_name ILIKE ${p} OR e.message ILIKE ${p})`, `%${escapeLike(search)}%`);
  }
  if (filters.institutionId?.trim()) {
    const institutionId = filters.institutionId.trim();
    if (!/^[A-Z0-9-]{2,24}$/i.test(institutionId)) {
      throw new RequestValidationError('Institution identifier has an invalid format.');
    }
    add((p) => `e.institution_id = ${p}`, institutionId.toUpperCase());
  }
  const period = normalizePeriod(filters.period);
  if (period) add((p) => `e.reporting_period = ${p}`, period);
  if (filters.severity) {
    const severity = filters.severity.toLowerCase();
    if (!['critical', 'high', 'medium', 'low'].includes(severity)) {
      throw new RequestValidationError('Severity must be critical, high, medium or low.');
    }
    add((p) => `e.severity = ${p}`, severity);
  }
  if (filters.status) {
    if (!['open', 'under_review', 'resolved'].includes(filters.status)) {
      throw new RequestValidationError('Status must be open, under_review or resolved.');
    }
    add((p) => `e.status = ${p}`, filters.status);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const countResult = await query<{ total: number }>(
    `SELECT count(*)::int AS total
     FROM supervisory_exceptions e
     JOIN institutions i USING (institution_id)
     ${where}`,
    values,
  );
  const total = numericValue(countResult.rows[0].total);
  const result = await query(
    `SELECT e.*, i.institution_name
     FROM supervisory_exceptions e
     JOIN institutions i USING (institution_id)
     ${where}
     ORDER BY CASE e.severity
       WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
       e.reporting_period DESC, e.created_at DESC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, pageSize, offset],
  );

  return {
    items: result.rows.map(mapException),
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getAnalytics(
  requestedPeriod?: string,
  requestedIndicator?: string,
): Promise<{
  period: string | null;
  indicators: Array<{ id: string; label: string; unit: string; value: number | null; formula: string }>;
  trend: Array<{ period: string; deposits: number; loans: number; completeness: number | null }>;
}> {
  const periodFilter = normalizePeriod(requestedPeriod) ?? null;
  const selectedIndicator = requestedIndicator?.trim() ?? '';
  if (
    selectedIndicator &&
    !INDICATOR_DEFINITIONS.some((definition) => definition.id === selectedIndicator)
  ) {
    throw new RequestValidationError('Indicator is not in the training catalog.');
  }
  const periodResult = await query<{ period: string | null }>(
    `SELECT COALESCE($1::text, MAX(reporting_period)) AS period
     FROM institution_reports`,
    [periodFilter],
  );
  const period = periodResult.rows[0]?.period ?? null;
  if (!period) return { period: null, indicators: [], trend: [] };
  const definitions = await query(
    `SELECT d.indicator_id, d.label, d.unit, d.formula,
       COALESCE(sec.indicator_value, inst.avg_value)::float8 AS value
     FROM indicator_definitions d
     LEFT JOIN LATERAL (
       SELECT s.indicator_value
       FROM supervisory_indicators s
       WHERE s.indicator_id = d.indicator_id AND s.reporting_period = $1
         AND s.grain = 'sector' AND s.subject_key = 'SECTOR'
       LIMIT 1
     ) sec ON true
     LEFT JOIN LATERAL (
       SELECT avg(s2.indicator_value)::float8 AS avg_value
       FROM supervisory_indicators s2
       WHERE s2.indicator_id = d.indicator_id AND s2.reporting_period = $1
         AND s2.grain = 'institution'
     ) inst ON true
     WHERE ($2 = '' OR d.indicator_id = $2)
     ORDER BY d.label`,
    [period, selectedIndicator],
  );
  const trend = await query(
    `SELECT reporting_period AS period,
       sum(deposits_tzs_billions)::float8 AS deposits,
       sum(loans_tzs_billions)::float8 AS loans,
       avg(report_completeness_percent)::float8 AS completeness
     FROM institution_reports
     WHERE reporting_period <= $1
     GROUP BY reporting_period
     ORDER BY reporting_period DESC
     LIMIT 12`,
    [period],
  );
  return {
    period,
    indicators: definitions.rows.map((row) => ({
      id: row.indicator_id,
      label: row.label,
      unit: row.unit,
      value: numeric(row.value),
      formula: row.formula,
    })),
    trend: trend.rows.reverse().map((row) => ({
      period: row.period,
      deposits: numericValue(row.deposits),
      loans: numericValue(row.loans),
      completeness: numeric(row.completeness),
    })),
  };
}

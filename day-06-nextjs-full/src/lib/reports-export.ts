import { toCsv } from './csv';
import { query } from './db';
import { recordEvent } from './events';
import { listReports, type Page, type ReportFilters } from './repository';

export const REPORT_EXPORT_COLUMNS = [
  'report_id',
  'institution_id',
  'reporting_period',
  'deposits_tzs_billions',
  'loans_tzs_billions',
  'capital_adequacy_ratio_percent',
  'liquidity_ratio_percent',
  'npl_ratio_percent',
  'report_completeness_percent',
  'late_submission_days',
  'records_submitted',
  'records_rejected',
  'submitted_at',
];

const PAGE_SIZE = 50;
const MAX_PAGES = 20;
const MAX_ROWS = 1000;

export type ReportExportRow = Record<string, unknown>;

export type ReportExportPageFetcher = (
  filters: ReportFilters,
) => Promise<Page<ReportExportRow>>;

export interface ReportExportResult {
  csv: string;
  rowCount: number;
  truncated: boolean;
}

function numeric(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function scopedFilters(filters: ReportFilters): ReportFilters {
  return {
    search: filters.search?.trim() || undefined,
    institutionId: filters.institutionId?.trim() || undefined,
    period: filters.period || undefined,
  };
}

async function fetchExportPage(filters: ReportFilters): Promise<Page<ReportExportRow>> {
  const pageResult = await listReports(filters);
  if (pageResult.items.length === 0) {
    return { ...pageResult, items: [] };
  }

  const reportIds = pageResult.items.map((item) => item.reportId);
  const detail = await query(
    `SELECT report_id, institution_id, reporting_period, deposits_tzs_billions,
       loans_tzs_billions, capital_adequacy_ratio_percent, liquidity_ratio_percent,
       npl_ratio_percent, report_completeness_percent, late_submission_days,
       records_submitted, records_rejected, submitted_at
     FROM institution_reports
     WHERE report_id = ANY($1::text[])`,
    [reportIds],
  );

  const byId = new Map<string, ReportExportRow>();
  for (const row of detail.rows) {
    byId.set(String(row.report_id), {
      report_id: row.report_id,
      institution_id: row.institution_id,
      reporting_period: row.reporting_period,
      deposits_tzs_billions: numeric(row.deposits_tzs_billions),
      loans_tzs_billions: numeric(row.loans_tzs_billions),
      capital_adequacy_ratio_percent: numeric(row.capital_adequacy_ratio_percent),
      liquidity_ratio_percent: numeric(row.liquidity_ratio_percent),
      npl_ratio_percent: numeric(row.npl_ratio_percent),
      report_completeness_percent: numeric(row.report_completeness_percent),
      late_submission_days: numeric(row.late_submission_days),
      records_submitted: numeric(row.records_submitted),
      records_rejected: numeric(row.records_rejected),
      submitted_at: new Date(row.submitted_at).toISOString(),
    });
  }

  return {
    ...pageResult,
    items: reportIds
      .map((reportId) => byId.get(reportId))
      .filter((row): row is ReportExportRow => row !== undefined),
  };
}

async function recordReportRun(
  filters: ReportFilters,
  resultCount: number,
  createdBy: string,
): Promise<boolean> {
  try {
    await query(
      `INSERT INTO report_runs (filters, status, result_count, created_by)
       VALUES ($1::jsonb, 'completed', $2, $3)`,
      [JSON.stringify(filters), resultCount, createdBy],
    );
    return true;
  } catch {
    return false;
  }
}

export async function buildReportExport(
  filters: ReportFilters,
  fetchPage?: ReportExportPageFetcher,
  createdBy = 'demo.supervisor',
): Promise<ReportExportResult> {
  const fetcher = fetchPage ?? fetchExportPage;
  const scoped = scopedFilters(filters);
  const rows: ReportExportRow[] = [];
  let total = 0;
  let totalPages = 0;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result = await fetcher({ ...scoped, page, pageSize: PAGE_SIZE });
    if (page === 1) {
      total = result.total;
      totalPages = result.totalPages;
    }
    rows.push(...result.items);
    if (rows.length >= MAX_ROWS || page >= totalPages) break;
  }

  const boundedRows = rows.slice(0, MAX_ROWS);
  const csv = toCsv(boundedRows, [...REPORT_EXPORT_COLUMNS]);
  const truncated = total > boundedRows.length;

  if (!fetchPage) {
    await Promise.all([
      recordReportRun(scoped, boundedRows.length, createdBy),
      recordEvent('report_exported', { rowCount: boundedRows.length, filters: scoped }),
    ]);
  }

  return { csv, rowCount: boundedRows.length, truncated };
}

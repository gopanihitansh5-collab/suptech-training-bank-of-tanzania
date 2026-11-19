import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { computeAnalytics } from './metrics';
import type { DemoInstitution, DemoReport } from './demo-data';
import { query, withTransaction } from './db';
import { RequestValidationError } from './api-errors';
import {
  parseReportImportCsv,
  validateReportImportRows,
  type ParsedReportImport,
  type ReportImportMapping,
  type ReportImportPreview,
  type ReportImportReferenceData,
} from './report-import';

type ImportStatus = 'completed' | 'completed_with_errors' | 'rejected';

export interface ReportImportBatch {
  batchId: string;
  filename: string;
  uploadedBy: string;
  status: ImportStatus;
  totalRows: number;
  acceptedRows: number;
  rejectedRows: number;
  columns: string[];
  mapping: ReportImportMapping;
  checksum: string;
  createdAt: string;
}

export interface ReportImportRowResult {
  rowNumber: number;
  sourceRecordId: string;
  institutionId: string | null;
  period: string | null;
  reportId: string | null;
  status: 'accepted' | 'rejected';
  errors: string[];
  additionalFieldCount: number;
}

export interface ReportImportResult {
  batch: ReportImportBatch;
  rows: ReportImportRowResult[];
}

export interface ReportImportSummary {
  batches: number;
  acceptedRows: number;
  rejectedRows: number;
}

function importKey(institutionId: string, period: string): string {
  return `${institutionId}\u0000${period}`;
}

async function loadReferenceData(): Promise<ReportImportReferenceData> {
  const [institutions, reports] = await Promise.all([
    query<{ institution_id: string }>('SELECT institution_id FROM institutions'),
    query<{ institution_id: string; reporting_period: string }>(
      'SELECT institution_id, reporting_period FROM institution_reports',
    ),
  ]);
  return {
    institutionIds: new Set(institutions.rows.map((row) => row.institution_id)),
    existingReports: new Set(
      reports.rows.map((row) => importKey(row.institution_id, row.reporting_period)),
    ),
  };
}

export async function previewReportImport(
  buffer: Buffer,
  mapping?: unknown,
): Promise<ReportImportPreview> {
  const parsed = parseReportImportCsv(buffer, mapping);
  return validateReportImportRows(parsed, await loadReferenceData());
}

async function insertMany(
  client: PoolClient,
  table: string,
  columns: string[],
  rows: unknown[][],
  suffix = '',
): Promise<void> {
  const batchSize = 100;
  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    const values: unknown[] = [];
    const tuples = batch.map((row) => {
      const placeholders = row.map((value) => {
        values.push(value);
        return `$${values.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });
    await client.query(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${tuples.join(', ')} ${suffix}`,
      values,
    );
  }
}

function safeFilename(filename: string): string {
  const cleaned = filename.replace(/[\\/]/g, '_').trim().slice(0, 255);
  return cleaned || 'report-import.csv';
}

function databaseNumber(value: string | number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error('Database returned a non-numeric report value.');
  }
  return parsed;
}

function databaseInstitutionType(
  value: string,
): DemoInstitution['type'] {
  if (
    value === 'Commercial Bank' ||
    value === 'Microfinance Institution' ||
    value === 'Development Finance Institution'
  ) {
    return value;
  }
  throw new Error('Database contains an unsupported institution type.');
}

function databaseTier(value: string): DemoInstitution['tier'] {
  if (value === 'Tier 1' || value === 'Tier 2' || value === 'Tier 3') return value;
  throw new Error('Database contains an unsupported institution tier.');
}

function databaseStatus(value: string): DemoInstitution['status'] {
  if (value === 'active' || value === 'monitoring') return value;
  throw new Error('Database contains an unsupported institution status.');
}

async function refreshAnalytics(client: PoolClient): Promise<void> {
  const institutionResult = await client.query<{
    institution_id: string;
    institution_name: string;
    institution_type: string;
    region: string;
    tier: string;
    status: string;
  }>(
    `SELECT institution_id, institution_name, institution_type, region, tier, status
     FROM institutions`,
  );
  const reportResult = await client.query<{
    report_id: string;
    institution_id: string;
    reporting_period: string;
    deposits_tzs_billions: string | number;
    loans_tzs_billions: string | number;
    capital_adequacy_ratio_percent: string | number;
    liquidity_ratio_percent: string | number;
    npl_ratio_percent: string | number;
    report_completeness_percent: string | number;
    late_submission_days: number;
    records_submitted: number;
    records_rejected: number;
    source_record_ids: string[];
    submitted_at: Date | string;
  }>(
    `SELECT report_id, institution_id, reporting_period,
       deposits_tzs_billions, loans_tzs_billions,
       capital_adequacy_ratio_percent, liquidity_ratio_percent,
       npl_ratio_percent, report_completeness_percent,
       late_submission_days, records_submitted, records_rejected,
       source_record_ids, submitted_at
     FROM institution_reports
     ORDER BY institution_id, reporting_period`,
  );

  const institutions: DemoInstitution[] = institutionResult.rows.map((row) => ({
    id: row.institution_id,
    name: row.institution_name,
    type: databaseInstitutionType(row.institution_type),
    region: row.region,
    tier: databaseTier(row.tier),
    status: databaseStatus(row.status),
    synthetic: true,
  }));
  const reports: DemoReport[] = reportResult.rows.map((row) => ({
    id: row.report_id,
    institutionId: row.institution_id,
    period: row.reporting_period,
    depositsTzsBillions: databaseNumber(row.deposits_tzs_billions),
    loansTzsBillions: databaseNumber(row.loans_tzs_billions),
    capitalAdequacyRatioPercent: databaseNumber(row.capital_adequacy_ratio_percent),
    liquidityRatioPercent: databaseNumber(row.liquidity_ratio_percent),
    nplRatioPercent: databaseNumber(row.npl_ratio_percent),
    reportCompletenessPercent: databaseNumber(row.report_completeness_percent),
    lateSubmissionDays: row.late_submission_days,
    recordsSubmitted: row.records_submitted,
    recordsRejected: row.records_rejected,
    sourceRecordIds: row.source_record_ids,
    submittedAtISO: row.submitted_at instanceof Date
      ? row.submitted_at.toISOString()
      : new Date(row.submitted_at).toISOString(),
  }));

  const analytics = computeAnalytics(institutions, reports);
  await insertMany(
    client,
    'supervisory_indicators',
    [
      'indicator_id',
      'grain',
      'reporting_period',
      'institution_id',
      'subject_key',
      'indicator_value',
      'unit',
      'formula',
      'source_report_ids',
    ],
    analytics.indicators.map((indicator) => {
      const grain = indicator.institutionId ? 'institution' : 'sector';
      const subjectKey = indicator.institutionId ?? 'SECTOR';
      return [
        indicator.indicatorId,
        grain,
        indicator.period,
        indicator.institutionId,
        subjectKey,
        indicator.value,
        indicator.unit,
        indicator.formula,
        indicator.sourceReportIds,
      ];
    }),
    `ON CONFLICT (indicator_id, grain, reporting_period, subject_key)
     DO UPDATE SET indicator_value = EXCLUDED.indicator_value,
       unit = EXCLUDED.unit, formula = EXCLUDED.formula,
       source_report_ids = EXCLUDED.source_report_ids, calculated_at = now()`,
  );
  await insertMany(
    client,
    'supervisory_exceptions',
    [
      'exception_id',
      'institution_id',
      'report_id',
      'reporting_period',
      'indicator_id',
      'observed_value',
      'threshold_value',
      'severity',
      'status',
      'message',
    ],
    analytics.exceptions.map((exception) => [
      exception.id,
      exception.institutionId,
      exception.reportId,
      exception.period,
      exception.indicatorId,
      exception.observedValue,
      exception.thresholdValue,
      exception.severity,
      exception.status,
      exception.message,
    ]),
    'ON CONFLICT (exception_id) DO NOTHING',
  );
}

export async function ingestReportCsv(input: {
  buffer: Buffer;
  filename: string;
  mapping?: unknown;
  uploadedBy: string;
}): Promise<ReportImportResult> {
  const parsed: ParsedReportImport = parseReportImportCsv(input.buffer, input.mapping);
  if (parsed.missingFields.length) {
    throw new RequestValidationError('Map every required report field before importing.');
  }
  const batchId = randomUUID();
  const checksum = createHash('sha256').update(input.buffer).digest('hex');
  const filename = safeFilename(input.filename);

  return withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('suptech-report-import'))");

    const [institutionResult, existingResult] = await Promise.all([
      client.query<{ institution_id: string }>(
        'SELECT institution_id FROM institutions',
      ),
      client.query<{ institution_id: string; reporting_period: string }>(
        'SELECT institution_id, reporting_period FROM institution_reports',
      ),
    ]);
    const reference: ReportImportReferenceData = {
      institutionIds: new Set(institutionResult.rows.map((row) => row.institution_id)),
      existingReports: new Set(
        existingResult.rows.map((row) => importKey(row.institution_id, row.reporting_period)),
      ),
    };
    const preview = validateReportImportRows(parsed, reference);

    await client.query(
      `INSERT INTO report_import_batches
         (batch_id, original_filename, checksum_sha256, uploaded_by, status,
          total_rows, accepted_rows, rejected_rows, column_headers, column_mapping)
       VALUES ($1, $2, $3, $4, 'rejected', $5, 0, $5, $6, $7::jsonb)`,
      [
        batchId,
        filename,
        checksum,
        input.uploadedBy,
        parsed.rows.length,
        parsed.columns,
        JSON.stringify(parsed.mapping),
      ],
    );

    const readyByRow = new Map(
      preview.rows
        .filter((row) => row.status === 'ready')
        .map((row) => [row.rowNumber, row]),
    );
    const candidates = parsed.rows.flatMap((row) => {
      if (!row.values || !readyByRow.has(row.rowNumber)) return [];
      const reportId = `IMP-${batchId.slice(0, 8)}-${row.rowNumber}`;
      return [{
        row,
        reportId,
        sourceRecordId: row.sourceRecordId ?? `CSV-${batchId.slice(0, 8)}-${row.rowNumber}`,
      }];
    });
    const candidateByRow = new Map(
      candidates.map((candidate) => [candidate.row.rowNumber, candidate]),
    );

    const insertedReportIds = new Set<string>();
    for (let start = 0; start < candidates.length; start += 100) {
      const batch = candidates.slice(start, start + 100);
      const values: unknown[] = [];
      const tuples = batch.map(({ row, reportId, sourceRecordId }) => {
        const report = row.values;
        if (!report) throw new Error('Validated CSV row has no report values.');
        const rowValues: unknown[] = [
          reportId,
          report.institutionId,
          report.period,
          report.depositsTzsBillions,
          report.loansTzsBillions,
          report.capitalAdequacyRatioPercent,
          report.liquidityRatioPercent,
          report.nplRatioPercent,
          report.reportCompletenessPercent,
          report.lateSubmissionDays,
          report.recordsSubmitted,
          report.recordsRejected,
          [sourceRecordId],
          new Date(),
          true,
        ];
        const placeholders = rowValues.map((value) => {
          values.push(value);
          return `$${values.length}`;
        });
        return `(${placeholders.join(', ')})`;
      });
      const inserted = await client.query<{ report_id: string }>(
        `INSERT INTO institution_reports
           (report_id, institution_id, reporting_period, deposits_tzs_billions,
            loans_tzs_billions, capital_adequacy_ratio_percent,
            liquidity_ratio_percent, npl_ratio_percent,
            report_completeness_percent, late_submission_days,
            records_submitted, records_rejected, source_record_ids,
            submitted_at, synthetic)
         VALUES ${tuples.join(', ')}
         ON CONFLICT (institution_id, reporting_period) DO NOTHING
         RETURNING report_id`,
        values,
      );
      for (const row of inserted.rows) insertedReportIds.add(row.report_id);
    }

    const previewByRow = new Map(preview.rows.map((row) => [row.rowNumber, row]));
    const rowResults: ReportImportRowResult[] = parsed.rows.map((row) => {
      const previewRow = previewByRow.get(row.rowNumber);
      if (!previewRow) throw new Error('CSV preview omitted a parsed row.');
      const candidate = candidateByRow.get(row.rowNumber);
      const reportId = candidate && insertedReportIds.has(candidate.reportId)
        ? candidate.reportId
        : null;
      const errors = [...previewRow.errors];
      if (candidate && !reportId) {
        errors.push('A report already exists for this institution and period.');
      }
      return {
        rowNumber: row.rowNumber,
        sourceRecordId: candidate?.sourceRecordId ?? row.sourceRecordId ??
          `CSV-${batchId.slice(0, 8)}-${row.rowNumber}`,
        institutionId: row.values?.institutionId ?? null,
        period: row.values?.period ?? null,
        reportId,
        status: reportId ? 'accepted' : 'rejected',
        errors,
        additionalFieldCount: reportId ? Object.keys(row.additionalFields).length : 0,
      };
    });

    const resultByRow = new Map(rowResults.map((result) => [result.rowNumber, result]));
    await insertMany(
      client,
      'report_import_rows',
      [
        'batch_id',
        'row_number',
        'source_record_id',
        'report_id',
        'status',
        'errors',
        'additional_fields',
      ],
      parsed.rows.map((row) => {
        const result = resultByRow.get(row.rowNumber);
        if (!result) throw new Error('CSV import result omitted a parsed row.');
        const accepted = result.status === 'accepted';
        return [
          batchId,
          row.rowNumber,
          result.sourceRecordId,
          result.reportId,
          result.status,
          JSON.stringify(result.errors),
          JSON.stringify(accepted ? row.additionalFields : {}),
        ];
      }),
    );

    const acceptedRows = rowResults.filter((row) => row.status === 'accepted').length;
    const rejectedRows = rowResults.length - acceptedRows;
    const status: ImportStatus = acceptedRows === 0
      ? 'rejected'
      : rejectedRows > 0
        ? 'completed_with_errors'
        : 'completed';

    if (acceptedRows > 0) await refreshAnalytics(client);

    await client.query(
      `UPDATE report_import_batches
       SET status = $2, accepted_rows = $3, rejected_rows = $4
       WHERE batch_id = $1`,
      [batchId, status, acceptedRows, rejectedRows],
    );
    await client.query(
      `INSERT INTO audit_events (actor_id, action, entity_type, entity_id, details)
       VALUES ($1, 'reports_imported', 'report_import_batch', $2, $3::jsonb)`,
      [
        input.uploadedBy,
        batchId,
        JSON.stringify({
          filename,
          checksum,
          totalRows: rowResults.length,
          acceptedRows,
          rejectedRows,
          status,
        }),
      ],
    );

    return {
      batch: {
        batchId,
        filename,
        uploadedBy: input.uploadedBy,
        status,
        totalRows: rowResults.length,
        acceptedRows,
        rejectedRows,
        columns: parsed.columns,
        mapping: parsed.mapping,
        checksum,
        createdAt: new Date().toISOString(),
      },
      rows: rowResults,
    };
  });
}

export async function listReportImportBatches(limit = 10): Promise<ReportImportBatch[]> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
    throw new RequestValidationError('Import history limit must be between 1 and 50.');
  }

  const result = await query<{
    batch_id: string;
    original_filename: string;
    uploaded_by: string;
    status: ImportStatus;
    total_rows: number;
    accepted_rows: number;
    rejected_rows: number;
    column_headers: string[];
    column_mapping: ReportImportMapping;
    checksum_sha256: string;
    created_at: Date | string;
  }>(
    `SELECT batch_id, original_filename, uploaded_by, status, total_rows,
       accepted_rows, rejected_rows, column_headers, column_mapping,
       checksum_sha256, created_at
     FROM report_import_batches
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit],
  );

  return result.rows.map((row) => ({
    batchId: row.batch_id,
    filename: row.original_filename,
    uploadedBy: row.uploaded_by,
    status: row.status,
    totalRows: row.total_rows,
    acceptedRows: row.accepted_rows,
    rejectedRows: row.rejected_rows,
    columns: row.column_headers,
    mapping: row.column_mapping,
    checksum: row.checksum_sha256,
    createdAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : new Date(row.created_at).toISOString(),
  }));
}

export async function getReportImportSummary(): Promise<ReportImportSummary> {
  const result = await query<{
    batches: number;
    accepted_rows: number;
    rejected_rows: number;
  }>(
    `SELECT count(*)::int AS batches,
       COALESCE(sum(accepted_rows), 0)::int AS accepted_rows,
       COALESCE(sum(rejected_rows), 0)::int AS rejected_rows
     FROM report_import_batches`,
  );
  const row = result.rows[0];
  if (!row) throw new Error('Database did not return the report import summary.');
  return {
    batches: row.batches,
    acceptedRows: row.accepted_rows,
    rejectedRows: row.rejected_rows,
  };
}

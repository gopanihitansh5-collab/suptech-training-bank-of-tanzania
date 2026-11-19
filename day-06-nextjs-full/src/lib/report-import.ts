import { parse } from 'csv-parse/sync';
import { RequestValidationError } from './api-errors';
import { REPORT_IMPORT_FIELDS } from './report-import-schema';
import type {
  ParsedReportImport,
  ParsedReportImportRow,
  ParsedReportValues,
  ReportImportField,
  ReportImportMapping,
  ReportImportPreview,
  ReportImportPreviewRow,
  ReportImportReferenceData,
} from './report-import-schema';

export type {
  ParsedReportImport,
  ParsedReportImportRow,
  ParsedReportValues,
  ReportImportField,
  ReportImportMapping,
  ReportImportPreview,
  ReportImportPreviewRow,
  ReportImportReferenceData,
} from './report-import-schema';

export const MAX_REPORT_IMPORT_BYTES = 1_000_000;
export const MAX_REPORT_IMPORT_ROWS = 500;
export const MAX_REPORT_IMPORT_COLUMNS = 64;

function normalizeHeader(value: string): string {
  return value.toLocaleLowerCase('en').replace(/[^a-z0-9]/g, '');
}

function suggestMapping(columns: string[]): ReportImportMapping {
  const mapping: ReportImportMapping = {};
  const normalizedColumns = columns.map(normalizeHeader);

  for (const field of REPORT_IMPORT_FIELDS) {
    const aliases = new Set(field.aliases.map(normalizeHeader));
    const matches = columns.filter((_, index) => aliases.has(normalizedColumns[index]));
    if (matches.length === 1) mapping[field.key] = matches[0];
  }
  return mapping;
}

function validateMapping(value: unknown, columns: string[]): ReportImportMapping {
  if (value === undefined || value === null) return suggestMapping(columns);
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new RequestValidationError('Column mapping must be a JSON object.');
  }

  const result = suggestMapping(columns);
  const supportedFields = new Set<string>(REPORT_IMPORT_FIELDS.map((field) => field.key));

  for (const [field, column] of Object.entries(value)) {
    if (!supportedFields.has(field)) {
      throw new RequestValidationError('Column mapping contains an unsupported report field.');
    }
    if (column === null || column === '') {
      delete result[field as ReportImportField];
      continue;
    }
    if (typeof column !== 'string' || !columns.includes(column)) {
      throw new RequestValidationError(`Column mapping for ${field} must select a CSV column.`);
    }
    result[field as ReportImportField] = column;
  }

  const usedColumns = new Set<string>();
  for (const column of Object.values(result)) {
    if (usedColumns.has(column)) {
      throw new RequestValidationError('Each CSV column can map to only one report field.');
    }
    usedColumns.add(column);
  }
  return result;
}

function fieldValue(
  row: string[],
  columns: string[],
  mapping: ReportImportMapping,
  field: ReportImportField,
): string {
  const column = mapping[field];
  if (!column) return '';
  return row[columns.indexOf(column)]?.trim() ?? '';
}

function parseDecimal(
  value: string,
  label: string,
  errors: string[],
  options: { max: number; min?: number; maxDecimals?: number },
): number | null {
  const maxDecimals = options.maxDecimals ?? 4;
  const decimalPattern = new RegExp(`^-?\\d+(?:\\.\\d{1,${maxDecimals}})?$`);
  if (!decimalPattern.test(value)) {
    errors.push(`${label} must be a number with at most ${maxDecimals} decimal places.`);
    return null;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < (options.min ?? 0) || number >= options.max) {
    errors.push(`${label} is outside the supported range.`);
    return null;
  }
  return number;
}

function parseInteger(value: string, label: string, errors: string[]): number | null {
  if (!/^\d+$/.test(value)) {
    errors.push(`${label} must be a non-negative whole number.`);
    return null;
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number > 2_147_483_647) {
    errors.push(`${label} is outside the supported range.`);
    return null;
  }
  return number;
}

function parseValues(
  row: string[],
  columns: string[],
  mapping: ReportImportMapping,
): { values: ParsedReportValues | null; sourceRecordId: string | null; errors: string[] } {
  const errors: string[] = [];
  const missingFields = REPORT_IMPORT_FIELDS.filter(
    (field) => !('optional' in field) && !mapping[field.key],
  );
  if (missingFields.length) {
    return {
      values: null,
      sourceRecordId: null,
      errors: missingFields.map((field) => `Map a CSV column to ${field.label}.`),
    };
  }

  const institutionId = fieldValue(row, columns, mapping, 'institutionId').toUpperCase();
  if (!/^[A-Z0-9-]{2,24}$/.test(institutionId)) {
    errors.push('Institution ID must contain 2–24 letters, numbers, or hyphens.');
  }

  const period = fieldValue(row, columns, mapping, 'period');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    errors.push('Reporting period must use YYYY-MM format.');
  }

  const deposits = parseDecimal(
    fieldValue(row, columns, mapping, 'depositsTzsBillions'),
    'Deposits',
    errors,
    { max: 100_000_000_000_000 },
  );
  const loans = parseDecimal(
    fieldValue(row, columns, mapping, 'loansTzsBillions'),
    'Loans',
    errors,
    { max: 100_000_000_000_000 },
  );
  const capitalAdequacy = parseDecimal(
    fieldValue(row, columns, mapping, 'capitalAdequacyRatioPercent'),
    'Capital adequacy',
    errors,
    { max: 10_000 },
  );
  const liquidity = parseDecimal(
    fieldValue(row, columns, mapping, 'liquidityRatioPercent'),
    'Liquidity ratio',
    errors,
    { max: 10_000 },
  );
  const npl = parseDecimal(
    fieldValue(row, columns, mapping, 'nplRatioPercent'),
    'NPL ratio',
    errors,
    { max: 10_000 },
  );
  const completeness = parseDecimal(
    fieldValue(row, columns, mapping, 'reportCompletenessPercent'),
    'Report completeness',
    errors,
    { min: 0, max: 100.0001 },
  );
  const lateDays = parseInteger(
    fieldValue(row, columns, mapping, 'lateSubmissionDays'),
    'Late submission days',
    errors,
  );
  const recordsSubmitted = parseInteger(
    fieldValue(row, columns, mapping, 'recordsSubmitted'),
    'Records submitted',
    errors,
  );
  const recordsRejected = parseInteger(
    fieldValue(row, columns, mapping, 'recordsRejected'),
    'Records rejected',
    errors,
  );
  const sourceRecordId = mapping.sourceRecordId
    ? fieldValue(row, columns, mapping, 'sourceRecordId')
    : '';
  const validSourceRecordId =
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(sourceRecordId);
  if (sourceRecordId && !validSourceRecordId) {
    errors.push('Source record ID must be 1–120 safe characters.');
  }

  if (
    errors.length ||
    deposits === null ||
    loans === null ||
    capitalAdequacy === null ||
    liquidity === null ||
    npl === null ||
    completeness === null ||
    lateDays === null ||
    recordsSubmitted === null ||
    recordsRejected === null
  ) {
    return {
      values: null,
      sourceRecordId: validSourceRecordId ? sourceRecordId : null,
      errors,
    };
  }

  return {
    values: {
      institutionId,
      period,
      depositsTzsBillions: deposits,
      loansTzsBillions: loans,
      capitalAdequacyRatioPercent: capitalAdequacy,
      liquidityRatioPercent: liquidity,
      nplRatioPercent: npl,
      reportCompletenessPercent: completeness,
      lateSubmissionDays: lateDays,
      recordsSubmitted,
      recordsRejected,
    },
    sourceRecordId: sourceRecordId || null,
    errors,
  };
}

export function parseReportImportCsv(
  buffer: Buffer,
  requestedMapping?: unknown,
): ParsedReportImport {
  if (buffer.length === 0) throw new RequestValidationError('The CSV file is empty.');
  if (buffer.length > MAX_REPORT_IMPORT_BYTES) {
    throw new RequestValidationError('CSV files must be 1 MB or smaller.');
  }

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new RequestValidationError('CSV files must use valid UTF-8 text.');
  }

  let records: string[][];
  try {
    records = parse(text, {
      bom: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      max_record_size: 16_384,
    }) as string[][];
  } catch {
    throw new RequestValidationError('CSV could not be parsed. Check its delimiter and quoting.');
  }

  const headers = records.shift();
  if (!headers?.length) throw new RequestValidationError('CSV must include a header row.');
  if (headers.length > MAX_REPORT_IMPORT_COLUMNS) {
    throw new RequestValidationError(`CSV files may contain at most ${MAX_REPORT_IMPORT_COLUMNS} columns.`);
  }
  if (headers.some((header) => !header || header.length > 120)) {
    throw new RequestValidationError('CSV headers must be non-empty and 120 characters or fewer.');
  }
  const normalizedHeaders = headers.map(normalizeHeader);
  if (new Set(normalizedHeaders).size !== normalizedHeaders.length) {
    throw new RequestValidationError('CSV headers must be unique.');
  }
  if (!records.length) throw new RequestValidationError('CSV must contain at least one data row.');
  if (records.length > MAX_REPORT_IMPORT_ROWS) {
    throw new RequestValidationError(`CSV files may contain at most ${MAX_REPORT_IMPORT_ROWS} data rows.`);
  }

  const suggestedMapping = suggestMapping(headers);
  const mapping = validateMapping(requestedMapping, headers);
  const mappedColumns = new Set(Object.values(mapping));
  const rows = records.map((row, index): ParsedReportImportRow => {
    const rowNumber = index + 2;
    if (row.length !== headers.length) {
      return {
        rowNumber,
        sourceRecordId: null,
        values: null,
        additionalFields: {},
        errors: [`Row has ${row.length} values; expected ${headers.length}.`],
      };
    }

    const parsedRow = parseValues(row, headers, mapping);
    const additionalFields: Record<string, string> = {};
    for (let columnIndex = 0; columnIndex < headers.length; columnIndex += 1) {
      if (mappedColumns.has(headers[columnIndex])) continue;
      const value = row[columnIndex]?.trim() ?? '';
      if (!value) continue;
      if (value.length > 4000) {
        parsedRow.errors.push(`Extra field "${headers[columnIndex]}" exceeds 4,000 characters.`);
        continue;
      }
      additionalFields[headers[columnIndex]] = value;
    }

    return {
      rowNumber,
      ...parsedRow,
      additionalFields,
    };
  });

  return {
    columns: headers,
    mapping,
    suggestedMapping,
    missingFields: REPORT_IMPORT_FIELDS
      .filter((field) => !('optional' in field) && !mapping[field.key])
      .map((field) => field.key),
    rows,
  };
}

export function validateReportImportRows(
  parsed: ParsedReportImport,
  reference: ReportImportReferenceData,
): ReportImportPreview {
  const seenReportKeys = new Set<string>();
  const mappedColumns = new Set(Object.values(parsed.mapping));
  const additionalColumns = parsed.columns.filter((column) => !mappedColumns.has(column));
  let acceptedRows = 0;
  let rejectedRows = 0;

  const rows = parsed.rows.map((row): ReportImportPreviewRow => {
    const errors = [...row.errors];
    if (row.values) {
      const key = `${row.values.institutionId}\u0000${row.values.period}`;
      if (!reference.institutionIds.has(row.values.institutionId)) {
        errors.push(`Institution ${row.values.institutionId} does not exist.`);
      }
      if (reference.existingReports.has(key)) {
        errors.push('A report already exists for this institution and period.');
      }
      if (seenReportKeys.has(key)) {
        errors.push('This institution and period appears more than once in the CSV.');
      }
      if (!errors.length) seenReportKeys.add(key);
    }

    const status = errors.length === 0 && row.values ? 'ready' : 'rejected';
    if (status === 'ready') acceptedRows += 1;
    else rejectedRows += 1;
    return {
      rowNumber: row.rowNumber,
      institutionId: row.values?.institutionId ?? null,
      period: row.values?.period ?? null,
      sourceRecordId: row.sourceRecordId,
      additionalFieldCount: Object.keys(row.additionalFields).length,
      status,
      errors,
    };
  });

  return {
    columns: parsed.columns,
    mapping: parsed.mapping,
    suggestedMapping: parsed.suggestedMapping,
    missingFields: parsed.missingFields,
    totalRows: parsed.rows.length,
    acceptedRows,
    rejectedRows,
    additionalColumns,
    rows,
  };
}

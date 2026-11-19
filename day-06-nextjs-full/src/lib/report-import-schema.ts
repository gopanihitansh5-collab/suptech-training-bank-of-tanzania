export const REPORT_IMPORT_FIELDS = [
  {
    key: 'institutionId',
    label: 'Institution ID',
    aliases: ['institution_id', 'institution id', 'institution code', 'entity code'],
  },
  {
    key: 'period',
    label: 'Reporting period',
    aliases: ['reporting_period', 'reporting period', 'report month', 'period', 'month'],
  },
  {
    key: 'depositsTzsBillions',
    label: 'Deposits (TZS bn)',
    aliases: ['deposits_tzs_billions', 'deposits_tzs_bn', 'total deposits', 'deposits'],
  },
  {
    key: 'loansTzsBillions',
    label: 'Loans (TZS bn)',
    aliases: ['loans_tzs_billions', 'loans_tzs_bn', 'total loans', 'loans'],
  },
  {
    key: 'capitalAdequacyRatioPercent',
    label: 'Capital adequacy (%)',
    aliases: ['capital_adequacy_ratio_percent', 'capital adequacy ratio', 'car_percent', 'car'],
  },
  {
    key: 'liquidityRatioPercent',
    label: 'Liquidity ratio (%)',
    aliases: ['liquidity_ratio_percent', 'liquidity ratio', 'lcr_percent', 'lcr'],
  },
  {
    key: 'nplRatioPercent',
    label: 'NPL ratio (%)',
    aliases: ['npl_ratio_percent', 'npl ratio', 'npl_percent', 'npl'],
  },
  {
    key: 'reportCompletenessPercent',
    label: 'Report completeness (%)',
    aliases: ['report_completeness_percent', 'completeness_percent', 'report completeness', 'completeness'],
  },
  {
    key: 'lateSubmissionDays',
    label: 'Late submission days',
    aliases: ['late_submission_days', 'late submission days', 'late days'],
  },
  {
    key: 'recordsSubmitted',
    label: 'Records submitted',
    aliases: ['records_submitted', 'records submitted', 'submitted records'],
  },
  {
    key: 'recordsRejected',
    label: 'Records rejected',
    aliases: ['records_rejected', 'records rejected', 'rejected records'],
  },
  {
    key: 'sourceRecordId',
    label: 'Source record ID (optional)',
    aliases: ['source_record_id', 'source record id', 'source id', 'record id'],
    optional: true,
  },
] as const;

export type ReportImportField = (typeof REPORT_IMPORT_FIELDS)[number]['key'];
export type ReportImportMapping = Partial<Record<ReportImportField, string>>;

export interface ParsedReportValues {
  institutionId: string;
  period: string;
  depositsTzsBillions: number;
  loansTzsBillions: number;
  capitalAdequacyRatioPercent: number;
  liquidityRatioPercent: number;
  nplRatioPercent: number;
  reportCompletenessPercent: number;
  lateSubmissionDays: number;
  recordsSubmitted: number;
  recordsRejected: number;
}

export interface ParsedReportImportRow {
  rowNumber: number;
  sourceRecordId: string | null;
  values: ParsedReportValues | null;
  additionalFields: Record<string, string>;
  errors: string[];
}

export interface ParsedReportImport {
  columns: string[];
  mapping: ReportImportMapping;
  suggestedMapping: ReportImportMapping;
  missingFields: string[];
  rows: ParsedReportImportRow[];
}

export interface ReportImportReferenceData {
  institutionIds: Set<string>;
  existingReports: Set<string>;
}

export interface ReportImportPreviewRow {
  rowNumber: number;
  institutionId: string | null;
  period: string | null;
  sourceRecordId: string | null;
  additionalFieldCount: number;
  status: 'ready' | 'rejected';
  errors: string[];
}

export interface ReportImportPreview {
  columns: string[];
  mapping: ReportImportMapping;
  suggestedMapping: ReportImportMapping;
  missingFields: string[];
  totalRows: number;
  acceptedRows: number;
  rejectedRows: number;
  additionalColumns: string[];
  rows: ReportImportPreviewRow[];
}

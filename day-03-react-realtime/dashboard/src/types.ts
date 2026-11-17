/**
 * The shapes the Day 2 API serves.
 *
 * Every field here mirrors the API payload. Nothing in the dashboard
 * invents a value: the numbers on the screen are the numbers the API
 * returned, and a value the API could not compute arrives as null.
 */

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type Grain = 'institution' | 'sector';

export interface IndicatorValue {
  run_id: string;
  indicator_id: string;
  indicator_name: string;
  grain: Grain;
  reporting_period: string;
  subject_id: string;
  institution_id: string | null;
  indicator_value: number | null;
  unit: string;
  decimals: number;
  direction: string;
  calculation_basis: string;
}

export interface AuditEntry {
  exception_id: string;
  run_id: string;
  reporting_period: string;
  source_row_number: number;
  rule_id: string;
  rule_name: string;
  severity: string;
  observed_value: string | null;
  detail: string;
  relation: 'explains' | 'context';
  link_mode: string;
}

export interface SupervisoryException {
  exception_id: string;
  run_id: string;
  threshold_id: string;
  threshold_name: string;
  indicator_id: string;
  indicator_name: string;
  grain: Grain;
  reporting_period: string;
  subject_id: string;
  institution_id: string | null;
  source_row_number: number | null;
  severity: Severity;
  observed_value: number;
  observed_value_text: string;
  limit_description: string;
  message: string;
  explanation: string;
  status: string;
  link_mode: string;
  audit_entries?: AuditEntry[];
}

export interface Institution {
  institution_id: string;
  institution_name: string;
  institution_type: string | null;
  licence_status: string | null;
  region: string | null;
  reporting_frequency: string | null;
  watchlist_flag: string | null;
  exceptions?: number;
  critical_exceptions?: number;
}

export interface InstitutionDetail {
  institution_id: string;
  institution_name: string;
  institution_type: string | null;
  licence_status: string | null;
  region: string | null;
  reporting_frequency: string | null;
  watchlist_flag: string | null;
  indicators: IndicatorValue[];
  exceptions: SupervisoryException[];
}

export interface SectorSummary {
  run_id?: string;
  reporting_period?: string;
  institutions_reporting?: number;
  institutions_expected?: number;
  institutions_missing?: number;
  sector_total_deposits?: number;
  sector_total_loans?: number;
  sector_loan_to_deposit_ratio?: number;
  sector_deposit_concentration_hhi?: number;
  sector_watchlist_exposure_count?: number;
  sector_reporting_coverage_ratio?: number;
  exceptions?: number;
  critical_exceptions?: number;
  high_exceptions?: number;
  medium_exceptions?: number;
  low_exceptions?: number;
  periods?: SectorSummary[];
}

export interface ExceptionList {
  count: number;
  exceptions: SupervisoryException[];
}

export interface IndicatorList {
  count: number;
  indicators: IndicatorValue[];
}

export interface InstitutionList {
  count: number;
  institutions: Institution[];
}

export interface IndicatorCatalogEntry {
  indicator_id: string;
  indicator_name: string;
  grain: Grain;
  unit: string;
  decimals: number;
  direction: string;
  description: string;
  formula: string;
}

export interface ThresholdCatalogEntry {
  threshold_id: string;
  threshold_name: string;
  indicator_id: string;
  grain: Grain;
  severity: Severity;
  lower_bound: number | null;
  upper_bound: number | null;
  limit_description: string;
  message: string;
  rationale: string;
  link_mode: string;
}

export interface Meta {
  run_id: string | null;
  indicator_count: number;
  threshold_count: number;
  indicators: IndicatorCatalogEntry[];
  thresholds: ThresholdCatalogEntry[];
}

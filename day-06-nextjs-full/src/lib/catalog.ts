export interface IndicatorDefinition {
  id: string;
  label: string;
  unit: 'TZS bn' | '%' | 'count';
  formula: string;
  description: string;
}

export interface TrainingThreshold {
  id: string;
  indicatorId: string;
  label: string;
  operator: 'lt' | 'gt';
  value: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  rationale: string;
}

export const INDICATOR_DEFINITIONS: IndicatorDefinition[] = [
  { id: 'deposits', label: 'Customer deposits', unit: 'TZS bn', formula: 'reported deposits', description: 'Synthetic institution-reported deposits for the selected period.' },
  { id: 'loans', label: 'Gross loans', unit: 'TZS bn', formula: 'reported loans', description: 'Synthetic institution-reported outstanding loans for the selected period.' },
  { id: 'loan_to_deposit', label: 'Loan-to-deposit ratio', unit: '%', formula: 'loans / deposits × 100', description: 'Null when deposits are zero or missing.' },
  { id: 'deposit_growth', label: 'Deposit growth', unit: '%', formula: '(current deposits − previous period deposits) / previous period deposits × 100', description: 'Compared with the prior period available for the same institution; null when no valid prior period exists.' },
  { id: 'loan_growth', label: 'Loan growth', unit: '%', formula: '(current loans − previous period loans) / previous period loans × 100', description: 'Compared with the prior period available for the same institution; null when no valid prior period exists.' },
  { id: 'capital_adequacy', label: 'Capital adequacy', unit: '%', formula: 'reported capital adequacy ratio', description: 'Illustrative synthetic ratio, not a regulatory determination.' },
  { id: 'npl_ratio', label: 'Non-performing loan ratio', unit: '%', formula: 'reported NPL ratio', description: 'Illustrative synthetic asset-quality ratio.' },
  { id: 'liquidity', label: 'Liquidity ratio', unit: '%', formula: 'reported liquidity ratio', description: 'Illustrative synthetic liquidity ratio.' },
  { id: 'completeness', label: 'Reporting completeness', unit: '%', formula: 'reported completeness percentage', description: 'Synthetic share of expected report fields received.' },
  { id: 'quality_failure_rate', label: 'Data-quality failure rate', unit: '%', formula: 'rejected rows / (submitted rows + rejected rows) × 100', description: 'Null when the submitted and rejected row count is zero.' },
];

export const TRAINING_THRESHOLDS: TrainingThreshold[] = [
  { id: 'TRN-CAR-LOW', indicatorId: 'capital_adequacy', label: 'Capital ratio review signal', operator: 'lt', value: 10, severity: 'critical', rationale: 'Training-only comparison boundary.' },
  { id: 'TRN-LDR-HIGH', indicatorId: 'loan_to_deposit', label: 'High loan-to-deposit review signal', operator: 'gt', value: 110, severity: 'high', rationale: 'Training-only comparison boundary.' },
  { id: 'TRN-NPL-HIGH', indicatorId: 'npl_ratio', label: 'Elevated NPL review signal', operator: 'gt', value: 8, severity: 'high', rationale: 'Training-only comparison boundary.' },
  { id: 'TRN-LIQ-LOW', indicatorId: 'liquidity', label: 'Liquidity review signal', operator: 'lt', value: 100, severity: 'high', rationale: 'Training-only comparison boundary.' },
  { id: 'TRN-COMP-LOW', indicatorId: 'completeness', label: 'Incomplete report review signal', operator: 'lt', value: 90, severity: 'medium', rationale: 'Training-only comparison boundary.' },
  { id: 'TRN-DQ-HIGH', indicatorId: 'quality_failure_rate', label: 'Data-quality review signal', operator: 'gt', value: 1, severity: 'medium', rationale: 'Training-only comparison boundary.' },
];

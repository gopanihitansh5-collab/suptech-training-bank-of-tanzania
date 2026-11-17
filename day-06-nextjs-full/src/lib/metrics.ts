import { INDICATOR_DEFINITIONS, TRAINING_THRESHOLDS } from './catalog';
import type { TrainingThreshold } from './catalog';
import type { DemoInstitution, DemoReport } from './demo-data';

export interface IndicatorValue {
  indicatorId: string;
  institutionId: string | null;
  period: string;
  value: number | null;
  unit: 'TZS bn' | '%' | 'count';
  formula: string;
  sourceReportIds: string[];
}

export interface SupervisoryException {
  id: string;
  institutionId: string;
  institutionName: string;
  reportId: string;
  period: string;
  indicatorId: string;
  indicatorLabel: string;
  observedValue: number;
  thresholdValue: number;
  severity: TrainingThreshold['severity'];
  status: 'open';
  message: string;
}

export interface AnalyticsResult {
  indicators: IndicatorValue[];
  exceptions: SupervisoryException[];
}

function round(value: number, digits = 2): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function safePercent(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }
  return round((numerator / denominator) * 100);
}

export function computeAnalytics(
  institutions: DemoInstitution[],
  reports: DemoReport[],
): AnalyticsResult {
  const byInstitution = new Map<string, DemoReport[]>();
  const institutionNames = new Map(institutions.map(({ id, name }) => [id, name]));
  for (const report of reports) {
    const rows = byInstitution.get(report.institutionId) ?? [];
    rows.push(report);
    byInstitution.set(report.institutionId, rows);
  }

  const indicators: IndicatorValue[] = [];
  const exceptions: SupervisoryException[] = [];
  const definitionById = new Map(INDICATOR_DEFINITIONS.map((item) => [item.id, item]));

  for (const [institutionId, rows] of byInstitution) {
    rows.sort((a, b) => a.period.localeCompare(b.period));
    for (let index = 0; index < rows.length; index += 1) {
      const report = rows[index];
      const previous = rows[index - 1];
      const qualityDenominator = report.recordsSubmitted + report.recordsRejected;
      const values: Record<string, number | null> = {
        deposits: report.depositsTzsBillions,
        loans: report.loansTzsBillions,
        loan_to_deposit: safePercent(report.loansTzsBillions, report.depositsTzsBillions),
        deposit_growth: previous
          ? safePercent(
              report.depositsTzsBillions - previous.depositsTzsBillions,
              previous.depositsTzsBillions,
            )
          : null,
        loan_growth: previous
          ? safePercent(
              report.loansTzsBillions - previous.loansTzsBillions,
              previous.loansTzsBillions,
            )
          : null,
        capital_adequacy: report.capitalAdequacyRatioPercent,
        npl_ratio: report.nplRatioPercent,
        liquidity: report.liquidityRatioPercent,
        completeness: report.reportCompletenessPercent,
        quality_failure_rate: qualityDenominator > 0
          ? safePercent(report.recordsRejected, qualityDenominator)
          : null,
      };

      for (const definition of INDICATOR_DEFINITIONS) {
        indicators.push({
          indicatorId: definition.id,
          institutionId,
          period: report.period,
          value: values[definition.id],
          unit: definition.unit,
          formula: definition.formula,
          sourceReportIds: [report.id],
        });
      }

      for (const threshold of TRAINING_THRESHOLDS) {
        const observedValue = values[threshold.indicatorId];
        if (observedValue === null || observedValue === undefined) continue;
        const breached = threshold.operator === 'lt'
          ? observedValue < threshold.value
          : observedValue > threshold.value;
        if (!breached) continue;

        const definition = definitionById.get(threshold.indicatorId);
        exceptions.push({
          id: `EXC-${threshold.id}-${institutionId}-${report.period}`,
          institutionId,
          institutionName: institutionNames.get(institutionId) ?? institutionId,
          reportId: report.id,
          period: report.period,
          indicatorId: threshold.indicatorId,
          indicatorLabel: definition?.label ?? threshold.indicatorId,
          observedValue,
          thresholdValue: threshold.value,
          severity: threshold.severity,
          status: 'open',
          message: `${threshold.label}: observed ${observedValue}${definition?.unit === '%' ? '%' : ''}; training boundary ${threshold.operator === 'lt' ? '<' : '>'} ${threshold.value}${definition?.unit === '%' ? '%' : ''}.`,
        });
      }
    }
  }

  return { indicators, exceptions };
}

export function latestPeriod(reports: DemoReport[]): string | null {
  return reports.reduce<string | null>(
    (latest, report) => latest === null || report.period > latest ? report.period : latest,
    null,
  );
}

export function calculatePortfolioSummary(
  institutions: DemoInstitution[],
  reports: DemoReport[],
): {
  period: string | null;
  institutionCount: number;
  reportsReceived: number;
  reportsExpected: number;
  openExceptions: number;
  criticalExceptions: number;
  totalDepositsTzsBillions: number;
  totalLoansTzsBillions: number;
  averageCompletenessPercent: number | null;
} {
  const period = latestPeriod(reports);
  if (!period) {
    return {
      period: null,
      institutionCount: institutions.length,
      reportsReceived: 0,
      reportsExpected: institutions.length,
      openExceptions: 0,
      criticalExceptions: 0,
      totalDepositsTzsBillions: 0,
      totalLoansTzsBillions: 0,
      averageCompletenessPercent: null,
    };
  }

  const currentReports = reports.filter((report) => report.period === period);
  const analytics = computeAnalytics(institutions, currentReports);
  const reportExceptions = analytics.exceptions;
  const completeness = currentReports.map((report) => report.reportCompletenessPercent);

  return {
    period,
    institutionCount: institutions.length,
    reportsReceived: currentReports.length,
    reportsExpected: institutions.length,
    openExceptions: reportExceptions.length,
    criticalExceptions: reportExceptions.filter((item) => item.severity === 'critical').length,
    totalDepositsTzsBillions: round(
      currentReports.reduce((sum, report) => sum + report.depositsTzsBillions, 0),
    ),
    totalLoansTzsBillions: round(
      currentReports.reduce((sum, report) => sum + report.loansTzsBillions, 0),
    ),
    averageCompletenessPercent: completeness.length
      ? round(completeness.reduce((sum, value) => sum + value, 0) / completeness.length)
      : null,
  };
}

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

export function isConsecutivePeriod(previous: string, current: string): boolean {
  const previousYear = Number(previous.slice(0, 4));
  const previousMonth = Number(previous.slice(5, 7));
  const currentYear = Number(current.slice(0, 4));
  const currentMonth = Number(current.slice(5, 7));
  const previousIndex = previousYear * 12 + previousMonth - 1;
  const currentIndex = currentYear * 12 + currentMonth - 1;
  return currentIndex === previousIndex + 1;
}

function depositWeightedMean(rows: DemoReport[], pick: (report: DemoReport) => number): number | null {
  const deposits = rows.reduce((sum, report) => sum + report.depositsTzsBillions, 0);
  if (deposits === 0) return null;
  return round(rows.reduce((sum, report) => sum + pick(report) * report.depositsTzsBillions, 0) / deposits);
}

function simpleMean(rows: DemoReport[], pick: (report: DemoReport) => number): number | null {
  if (rows.length === 0) return null;
  return round(rows.reduce((sum, report) => sum + pick(report), 0) / rows.length);
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
        deposit_growth: previous && isConsecutivePeriod(previous.period, report.period)
          ? safePercent(
              report.depositsTzsBillions - previous.depositsTzsBillions,
              previous.depositsTzsBillions,
            )
          : null,
        loan_growth: previous && isConsecutivePeriod(previous.period, report.period)
          ? safePercent(
              report.loansTzsBillions - previous.loansTzsBillions,
              previous.loansTzsBillions,
            )
          : null,
        capital_adequacy: report.capitalAdequacyRatioPercent,
        npl_ratio: report.nplRatioPercent,
        liquidity: report.liquidityRatioPercent,
        completeness: report.reportCompletenessPercent,
        late_submission: report.lateSubmissionDays,
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

  const reportsByPeriod = new Map<string, DemoReport[]>();
  for (const report of reports) {
    const rows = reportsByPeriod.get(report.period) ?? [];
    rows.push(report);
    reportsByPeriod.set(report.period, rows);
  }

  const periodTotals = new Map<string, { deposits: number; loans: number; submitted: number; rejected: number }>();
  for (const [period, rows] of reportsByPeriod) {
    periodTotals.set(period, {
      deposits: rows.reduce((sum, report) => sum + report.depositsTzsBillions, 0),
      loans: rows.reduce((sum, report) => sum + report.loansTzsBillions, 0),
      submitted: rows.reduce((sum, report) => sum + report.recordsSubmitted, 0),
      rejected: rows.reduce((sum, report) => sum + report.recordsRejected, 0),
    });
  }

  for (const [period, rows] of reportsByPeriod) {
    const totals = periodTotals.get(period);
    if (!totals) continue;
    const previousPeriod = [...periodTotals.keys()].find((key) => isConsecutivePeriod(key, period));
    const previousTotals = previousPeriod ? periodTotals.get(previousPeriod) : undefined;
    const sectorValues: Record<string, number | null> = {
      deposits: round(totals.deposits),
      loans: round(totals.loans),
      loan_to_deposit: safePercent(totals.loans, totals.deposits),
      deposit_growth: previousTotals
        ? safePercent(totals.deposits - previousTotals.deposits, previousTotals.deposits)
        : null,
      loan_growth: previousTotals
        ? safePercent(totals.loans - previousTotals.loans, previousTotals.loans)
        : null,
      capital_adequacy: depositWeightedMean(rows, (report) => report.capitalAdequacyRatioPercent),
      npl_ratio: depositWeightedMean(rows, (report) => report.nplRatioPercent),
      liquidity: depositWeightedMean(rows, (report) => report.liquidityRatioPercent),
      completeness: simpleMean(rows, (report) => report.reportCompletenessPercent),
      late_submission: simpleMean(rows, (report) => report.lateSubmissionDays),
      quality_failure_rate: safePercent(totals.rejected, totals.submitted + totals.rejected),
    };

    for (const definition of INDICATOR_DEFINITIONS) {
      indicators.push({
        indicatorId: definition.id,
        institutionId: null,
        period,
        value: sectorValues[definition.id],
        unit: definition.unit,
        formula: definition.formula,
        sourceReportIds: rows.map((report) => report.id),
      });
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
  const analytics = computeAnalytics(institutions, reports);
  const reportExceptions = analytics.exceptions.filter((item) => item.period === period);
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

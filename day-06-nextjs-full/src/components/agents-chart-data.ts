export interface OverviewTrendPoint {
  period: string;
  deposits: number;
  loans: number;
  completeness: number | null;
  exceptions: number;
}

export interface InstitutionReportPoint {
  period: string;
  deposits: number;
  loans: number;
  car: number;
  npl: number;
  liquidity: number;
  completeness: number;
}

export interface AnalyticsTrendPoint {
  period: string;
  deposits: number;
  loans: number;
  completeness: number | null;
}

export interface AnalyticsIndicatorPoint {
  label: string;
  value: number;
  unit: string;
}

export interface ExceptionChartItem {
  id: string;
  institutionId: string;
  institutionName: string;
  period: string;
  indicator: string;
  severity: string;
  status: string;
  observed: number;
  threshold: number;
  message: string;
}

export interface ExceptionCount {
  name: string;
  count: number;
}

export interface ExceptionBreakdown {
  bySeverity: ExceptionCount[];
  byStatus: ExceptionCount[];
  items: ExceptionChartItem[];
}

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];
const STATUS_ORDER = ['open', 'under_review', 'resolved'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function arrayAt(source: unknown, ...path: string[]): unknown[] {
  let current: unknown = source;
  for (const key of path) {
    if (!isRecord(current)) return [];
    current = current[key];
  }
  return Array.isArray(current) ? current : [];
}

function countBy(values: string[], order: string[]): ExceptionCount[] {
  const totals = new Map<string, number>();
  for (const value of values) {
    totals.set(value, (totals.get(value) ?? 0) + 1);
  }
  const known = order
    .filter((name) => totals.has(name))
    .map((name) => ({ name, count: totals.get(name) ?? 0 }));
  const extra = Array.from(totals.keys())
    .filter((name) => !order.includes(name))
    .sort()
    .map((name) => ({ name, count: totals.get(name) ?? 0 }));
  return [...known, ...extra];
}

function severityRank(severity: string): number {
  const index = SEVERITY_ORDER.indexOf(severity);
  return index === -1 ? 0 : SEVERITY_ORDER.length - index;
}

export function overviewTrend(results: unknown): OverviewTrendPoint[] {
  return arrayAt(results, 'overview', 'trend').flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const period = asString(entry.period);
    const deposits = asFiniteNumber(entry.depositsTzsBillions);
    const loans = asFiniteNumber(entry.loansTzsBillions);
    if (!period || deposits === null || loans === null) return [];
    return [
      {
        period,
        deposits,
        loans,
        completeness: asFiniteNumber(entry.completenessPercent),
        exceptions: asFiniteNumber(entry.exceptions) ?? 0,
      },
    ];
  });
}

export function institutionReports(results: unknown): InstitutionReportPoint[] {
  return arrayAt(results, 'institution', 'reports')
    .flatMap((entry) => {
      if (!isRecord(entry)) return [];
      const period = asString(entry.period);
      const deposits = asFiniteNumber(entry.depositsTzsBillions);
      const loans = asFiniteNumber(entry.loansTzsBillions);
      const car = asFiniteNumber(entry.capitalAdequacyRatioPercent);
      const npl = asFiniteNumber(entry.nplRatioPercent);
      const liquidity = asFiniteNumber(entry.liquidityRatioPercent);
      const completeness = asFiniteNumber(entry.completenessPercent);
      if (
        !period ||
        deposits === null ||
        loans === null ||
        car === null ||
        npl === null ||
        liquidity === null ||
        completeness === null
      ) {
        return [];
      }
      return [{ period, deposits, loans, car, npl, liquidity, completeness }];
    })
    .sort((a, b) => a.period.localeCompare(b.period));
}

export function analyticsTrend(results: unknown): AnalyticsTrendPoint[] {
  return arrayAt(results, 'analytics', 'trend').flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const period = asString(entry.period);
    const deposits = asFiniteNumber(entry.deposits);
    const loans = asFiniteNumber(entry.loans);
    if (!period || deposits === null || loans === null) return [];
    return [
      {
        period,
        deposits,
        loans,
        completeness: asFiniteNumber(entry.completeness),
      },
    ];
  });
}

export function analyticsIndicators(results: unknown): AnalyticsIndicatorPoint[] {
  return arrayAt(results, 'analytics', 'indicators').flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const label = asString(entry.label);
    const value = asFiniteNumber(entry.value);
    if (!label || value === null) return [];
    return [{ label, value, unit: asString(entry.unit) ?? '' }];
  });
}

export function exceptionBreakdown(results: unknown): ExceptionBreakdown {
  const items = arrayAt(results, 'exceptions')
    .flatMap((entry) => {
      if (!isRecord(entry)) return [];
      const institutionId = asString(entry.institutionId);
      const institutionName = asString(entry.institutionName);
      const period = asString(entry.period);
      const indicator = asString(entry.indicatorId);
      const severity = asString(entry.severity);
      const status = asString(entry.status);
      const observed = asFiniteNumber(entry.observedValue);
      const threshold = asFiniteNumber(entry.thresholdValue);
      if (
        !period ||
        !indicator ||
        !severity ||
        !status ||
        observed === null ||
        threshold === null ||
        (!institutionId && !institutionName)
      ) {
        return [];
      }
      return [
        {
          id: asString(entry.id) ?? `${institutionId ?? institutionName}-${period}-${indicator}`,
          institutionId: institutionId ?? 'Unknown',
          institutionName: institutionName ?? institutionId ?? 'Unknown',
          period,
          indicator,
          severity: severity.toLowerCase(),
          status: status.toLowerCase(),
          observed,
          threshold,
          message: asString(entry.message) ?? '',
        },
      ];
    })
    .sort(
      (a, b) =>
        severityRank(b.severity) - severityRank(a.severity) ||
        b.period.localeCompare(a.period),
    );

  return {
    bySeverity: countBy(items.map((item) => item.severity), SEVERITY_ORDER),
    byStatus: countBy(items.map((item) => item.status), STATUS_ORDER),
    items,
  };
}

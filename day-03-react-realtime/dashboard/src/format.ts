/** Formatting helpers for the values the API serves. */

import type { IndicatorValue, Severity } from './types';

const SEVERITY_ORDER: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

/** Format a money amount in Tanzanian shillings. */
export function formatTZS(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  return new Intl.NumberFormat('en-TZ', {
    maximumFractionDigits: 0,
  }).format(value);
}

/** Format a ratio, for example a loan to deposit ratio. */
export function formatRatio(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  return value.toFixed(4);
}

/** Format a percentage. */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  return `${value.toFixed(2)}%`;
}

/** Format an indicator value with the decimals its catalog declares. */
export function formatIndicator(
  value: IndicatorValue | undefined,
): string {
  if (!value || value.indicator_value === null) {
    return '—';
  }
  if (value.unit === 'TZS') {
    return formatTZS(value.indicator_value);
  }
  if (value.unit === 'percent') {
    return formatPercent(value.indicator_value);
  }
  return value.indicator_value.toFixed(value.decimals);
}

/** Order the severities from the most urgent to the least. */
export function sortBySeverity(severities: Severity[]): Severity[] {
  return [...severities].sort(
    (left, right) => SEVERITY_ORDER.indexOf(left) - SEVERITY_ORDER.indexOf(right),
  );
}

export { SEVERITY_ORDER };

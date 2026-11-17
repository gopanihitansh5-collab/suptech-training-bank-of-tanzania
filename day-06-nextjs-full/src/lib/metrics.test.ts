import { describe, expect, it } from 'vitest';
import type { DemoInstitution, DemoReport } from './demo-data';
import { calculatePortfolioSummary, computeAnalytics } from './metrics';

const institution: DemoInstitution = {
  id: 'TZ001',
  name: 'Synthetic Example Bank',
  type: 'Commercial Bank',
  region: 'Dodoma',
  tier: 'Tier 2',
  status: 'active',
  synthetic: true,
};

function report(overrides: Partial<DemoReport> = {}): DemoReport {
  return {
    id: 'RPT-TZ001-2026-09',
    institutionId: institution.id,
    period: '2026-09',
    depositsTzsBillions: 100,
    loansTzsBillions: 80,
    capitalAdequacyRatioPercent: 14,
    liquidityRatioPercent: 130,
    nplRatioPercent: 3,
    reportCompletenessPercent: 98,
    lateSubmissionDays: 0,
    recordsSubmitted: 1000,
    recordsRejected: 0,
    sourceRecordIds: ['SRC-001'],
    submittedAtISO: '2026-10-05T00:00:00.000Z',
    ...overrides,
  };
}

describe('supervisory analytics', () => {
  it('keeps growth null when the prior period is absent', () => {
    const result = computeAnalytics([institution], [report()]);
    expect(result.indicators.find((item) => item.indicatorId === 'deposit_growth')?.value).toBeNull();
  });

  it('keeps a zero denominator null instead of reporting an infinite ratio', () => {
    const result = computeAnalytics(
      [institution],
      [report({ depositsTzsBillions: 0, loansTzsBillions: 0 })],
    );
    expect(result.indicators.find((item) => item.indicatorId === 'loan_to_deposit')?.value).toBeNull();
  });

  it('creates an exception only when the configured training boundary is crossed', () => {
    const equalToBoundary = computeAnalytics(
      [institution],
      [report({ capitalAdequacyRatioPercent: 10 })],
    );
    const belowBoundary = computeAnalytics(
      [institution],
      [report({ capitalAdequacyRatioPercent: 9.99 })],
    );
    expect(equalToBoundary.exceptions.some((item) => item.indicatorId === 'capital_adequacy')).toBe(false);
    expect(belowBoundary.exceptions.some((item) => item.indicatorId === 'capital_adequacy')).toBe(true);
  });

  it('summarizes only the latest period and reports missing data honestly', () => {
    const summary = calculatePortfolioSummary(
      [institution],
      [
        report({ period: '2026-08', id: 'RPT-TZ001-2026-08' }),
        report({ period: '2026-09', depositsTzsBillions: 125 }),
      ],
    );
    expect(summary.period).toBe('2026-09');
    expect(summary.reportsReceived).toBe(1);
    expect(summary.totalDepositsTzsBillions).toBe(125);
  });
});

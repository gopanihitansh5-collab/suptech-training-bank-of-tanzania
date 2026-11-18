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

const secondInstitution: DemoInstitution = {
  ...institution,
  id: 'TZ002',
  name: 'Synthetic Community Bank',
};

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

  it('keeps growth null across a period gap', () => {
    const result = computeAnalytics(
      [institution],
      [
        report({ period: '2026-08', id: 'RPT-TZ001-2026-08' }),
        report({ period: '2026-10', id: 'RPT-TZ001-2026-10' }),
      ],
    );
    const growth = result.indicators.find(
      (item) => item.indicatorId === 'deposit_growth' && item.period === '2026-10' && item.institutionId === institution.id,
    );
    expect(growth?.value).toBeNull();
  });

  it('computes growth across consecutive months', () => {
    const result = computeAnalytics(
      [institution],
      [
        report({ period: '2026-08', id: 'RPT-TZ001-2026-08', depositsTzsBillions: 100 }),
        report({ period: '2026-09', depositsTzsBillions: 125 }),
      ],
    );
    const growth = result.indicators.find(
      (item) => item.indicatorId === 'deposit_growth' && item.period === '2026-09' && item.institutionId === institution.id,
    );
    expect(growth?.value).toBe(25);
  });

  it('raises a medium late-submission exception only past three days', () => {
    const atFourDays = computeAnalytics([institution], [report({ lateSubmissionDays: 4 })]);
    const lateException = atFourDays.exceptions.find((item) => item.indicatorId === 'late_submission');
    expect(lateException?.severity).toBe('medium');
    const atThreeDays = computeAnalytics([institution], [report({ lateSubmissionDays: 3 })]);
    expect(atThreeDays.exceptions.some((item) => item.indicatorId === 'late_submission')).toBe(false);
  });

  it('rolls indicators up to the sector grain across institutions', () => {
    const result = computeAnalytics(
      [institution, secondInstitution],
      [
        report({
          depositsTzsBillions: 100,
          loansTzsBillions: 80,
          capitalAdequacyRatioPercent: 14,
          nplRatioPercent: 3,
          liquidityRatioPercent: 130,
          reportCompletenessPercent: 98,
          lateSubmissionDays: 0,
          recordsSubmitted: 1000,
          recordsRejected: 0,
        }),
        report({
          id: 'RPT-TZ002-2026-09',
          institutionId: secondInstitution.id,
          depositsTzsBillions: 300,
          loansTzsBillions: 90,
          capitalAdequacyRatioPercent: 12,
          nplRatioPercent: 4,
          liquidityRatioPercent: 120,
          reportCompletenessPercent: 96,
          lateSubmissionDays: 2,
          recordsSubmitted: 3000,
          recordsRejected: 30,
        }),
      ],
    );
    const sectorValue = (indicatorId: string) =>
      result.indicators.find((item) => item.indicatorId === indicatorId && item.institutionId === null)?.value;
    expect(sectorValue('deposits')).toBe(400);
    expect(sectorValue('loans')).toBe(170);
    expect(sectorValue('loan_to_deposit')).toBe(42.5);
    expect(sectorValue('completeness')).toBe(97);
    expect(sectorValue('capital_adequacy')).toBe(12.5);
    expect(sectorValue('quality_failure_rate')).toBe(0.74);
    expect(sectorValue('late_submission')).toBe(1);
  });

  it('counts portfolio exceptions only from the latest period', () => {
    const summary = calculatePortfolioSummary(
      [institution],
      [
        report({ period: '2026-08', id: 'RPT-TZ001-2026-08', capitalAdequacyRatioPercent: 9 }),
        report({ period: '2026-09', capitalAdequacyRatioPercent: 14 }),
      ],
    );
    expect(summary.openExceptions).toBe(0);
    expect(summary.period).toBe('2026-09');
  });
});

import { describe, expect, it } from 'vitest';
import {
  analyticsIndicators,
  analyticsTrend,
  exceptionBreakdown,
  institutionReports,
  overviewTrend,
} from './agents-chart-data';

const realisticResults = {
  overview: {
    trend: [
      {
        period: '2026-09',
        depositsTzsBillions: 120.5,
        loansTzsBillions: 90.2,
        completenessPercent: 96.4,
        exceptions: 3,
      },
      {
        period: '2026-10',
        depositsTzsBillions: 130.1,
        loansTzsBillions: 99.9,
        completenessPercent: null,
        exceptions: 5,
      },
    ],
  },
  institution: {
    reports: [
      {
        reportId: 'RPT-2026-10-TZ004',
        period: '2026-10',
        depositsTzsBillions: 130,
        loansTzsBillions: 100,
        capitalAdequacyRatioPercent: 12.5,
        nplRatioPercent: 7.1,
        liquidityRatioPercent: 140,
        completenessPercent: 98,
      },
      {
        reportId: 'RPT-2026-09-TZ004',
        period: '2026-09',
        depositsTzsBillions: 120,
        loansTzsBillions: 95,
        capitalAdequacyRatioPercent: 11.2,
        nplRatioPercent: 6.8,
        liquidityRatioPercent: 132,
        completenessPercent: 97,
      },
    ],
  },
  analytics: {
    trend: [
      { period: '2026-09', deposits: 10, loans: 8, completeness: 95 },
      { period: '2026-10', deposits: 12, loans: 9, completeness: null },
    ],
    indicators: [
      { id: 'deposits', label: 'Customer deposits', unit: 'TZS bn', value: 250, formula: 'reported deposits' },
      { id: 'npl_ratio', label: 'Non-performing loan ratio', unit: '%', value: null, formula: 'reported ratio' },
      { id: 'capital_adequacy', label: 'Capital adequacy', unit: '%', value: 12.4, formula: 'reported ratio' },
    ],
  },
  exceptions: [
    {
      id: 'EXC-TRN-NPL-HIGH-TZ001-2026-10',
      institutionId: 'TZ001',
      institutionName: 'Bank One',
      period: '2026-10',
      indicatorId: 'npl_ratio',
      observedValue: 9.2,
      thresholdValue: 8,
      severity: 'high',
      status: 'open',
      message: 'NPL above training boundary.',
    },
    {
      id: 'EXC-TRN-CAR-LOW-TZ004-2026-09',
      institutionId: 'TZ004',
      institutionName: 'Bank Four',
      period: '2026-09',
      indicatorId: 'capital_adequacy',
      observedValue: 8.1,
      thresholdValue: 10,
      severity: 'critical',
      status: 'open',
      message: 'Capital ratio below training boundary.',
    },
    {
      id: 'EXC-TRN-LIQ-LOW-TZ002-2026-10',
      institutionId: 'TZ002',
      institutionName: 'Bank Two',
      period: '2026-10',
      indicatorId: 'liquidity',
      observedValue: 95,
      thresholdValue: 100,
      severity: 'medium',
      status: 'under_review',
      message: 'Liquidity below training boundary.',
    },
    {
      id: 'EXC-TRN-COMP-LOW-TZ003-2026-08',
      institutionId: 'TZ003',
      institutionName: 'Bank Three',
      period: '2026-08',
      indicatorId: 'completeness',
      observedValue: 88,
      thresholdValue: 90,
      severity: 'medium',
      status: 'resolved',
      message: 'Completeness below training boundary.',
    },
    {
      id: 'EXC-TRN-NPL-HIGH-TZ001-2026-10',
      institutionId: 'TZ001',
      institutionName: 'Bank One',
      period: '2026-10',
      indicatorId: 'npl_ratio',
      observedValue: 9.2,
      thresholdValue: 8,
      severity: 'high',
      status: 'open',
      message: 'NPL above training boundary.',
    },
  ],
};

describe('overviewTrend', () => {
  it('maps overview trend rows into chart points', () => {
    expect(overviewTrend(realisticResults)).toEqual([
      { period: '2026-09', deposits: 120.5, loans: 90.2, completeness: 96.4, exceptions: 3 },
      { period: '2026-10', deposits: 130.1, loans: 99.9, completeness: null, exceptions: 5 },
    ]);
  });

  it('returns an empty array for malformed input', () => {
    expect(overviewTrend(null)).toEqual([]);
    expect(overviewTrend({ overview: { trend: 'missing' } })).toEqual([]);
    expect(
      overviewTrend({
        overview: {
          trend: [
            { period: '2026-10', depositsTzsBillions: 'not-a-number', loansTzsBillions: 10 },
            { depositsTzsBillions: 10, loansTzsBillions: 8 },
          ],
        },
      }),
    ).toEqual([]);
  });
});

describe('institutionReports', () => {
  it('maps reports and orders them oldest first', () => {
    expect(institutionReports(realisticResults)).toEqual([
      {
        period: '2026-09',
        deposits: 120,
        loans: 95,
        car: 11.2,
        npl: 6.8,
        liquidity: 132,
        completeness: 97,
      },
      {
        period: '2026-10',
        deposits: 130,
        loans: 100,
        car: 12.5,
        npl: 7.1,
        liquidity: 140,
        completeness: 98,
      },
    ]);
  });

  it('skips incomplete reports and handles malformed input', () => {
    expect(institutionReports(undefined)).toEqual([]);
    expect(
      institutionReports({
        institution: {
          reports: [
            { period: '2026-10', depositsTzsBillions: 10, loansTzsBillions: 8 },
            { period: '2026-10', depositsTzsBillions: 10, loansTzsBillions: 8, capitalAdequacyRatioPercent: 12 },
          ],
        },
      }),
    ).toEqual([]);
  });
});

describe('analyticsTrend', () => {
  it('maps the analytics trend with nullable completeness', () => {
    expect(analyticsTrend(realisticResults)).toEqual([
      { period: '2026-09', deposits: 10, loans: 8, completeness: 95 },
      { period: '2026-10', deposits: 12, loans: 9, completeness: null },
    ]);
  });

  it('returns an empty array when the trend is malformed', () => {
    expect(analyticsTrend({ analytics: null })).toEqual([]);
    expect(
      analyticsTrend({
        analytics: {
          trend: [{ period: '2026-10', deposits: 'x', loans: 9, completeness: 95 }],
        },
      }),
    ).toEqual([]);
  });
});

describe('analyticsIndicators', () => {
  it('maps indicators and filters null values', () => {
    expect(analyticsIndicators(realisticResults)).toEqual([
      { label: 'Customer deposits', value: 250, unit: 'TZS bn' },
      { label: 'Capital adequacy', value: 12.4, unit: '%' },
    ]);
  });

  it('returns an empty array for malformed indicators', () => {
    expect(analyticsIndicators({ analytics: { indicators: [null, 7] } })).toEqual([]);
    expect(
      analyticsIndicators({
        analytics: { indicators: [{ label: 'Missing value', unit: '%' }] },
      }),
    ).toEqual([]);
  });
});

describe('exceptionBreakdown', () => {
  it('counts severity and status and sorts the highest severity first', () => {
    const breakdown = exceptionBreakdown(realisticResults);

    expect(breakdown.bySeverity).toEqual([
      { name: 'critical', count: 1 },
      { name: 'high', count: 2 },
      { name: 'medium', count: 2 },
    ]);
    expect(breakdown.byStatus).toEqual([
      { name: 'open', count: 3 },
      { name: 'under_review', count: 1 },
      { name: 'resolved', count: 1 },
    ]);
    expect(breakdown.items).toHaveLength(5);
    expect(breakdown.items[0]).toMatchObject({
      id: 'EXC-TRN-CAR-LOW-TZ004-2026-09',
      institutionName: 'Bank Four',
      severity: 'critical',
      status: 'open',
    });
    expect(breakdown.items[1].severity).toBe('high');
  });

  it('returns empty collections for malformed exceptions', () => {
    expect(exceptionBreakdown({ exceptions: 'nope' })).toEqual({
      bySeverity: [],
      byStatus: [],
      items: [],
    });
    expect(
      exceptionBreakdown({
        exceptions: [
          null,
          { institutionId: 'TZ001', period: '2026-10', indicatorId: 'npl_ratio', severity: 'high', status: 'open' },
        ],
      }),
    ).toEqual({ bySeverity: [], byStatus: [], items: [] });
  });
});

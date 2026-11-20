import { describe, expect, it } from 'vitest';
import { narrateToolResult } from './assistant-narrative';

function factValue(
  facts: Array<{ label: string; value: string; detail?: string }>,
  label: string,
): string | undefined {
  return facts.find((fact) => fact.label === label)?.value;
}

describe('assistant narrative', () => {
  it('narrates portfolio totals, ratios and trend changes from real values', () => {
    const narrative = narrateToolResult('get_portfolio_overview', {
      period: '2026-10',
      summary: {
        institutions: 4,
        reportsReceived: 3,
        reportsExpected: 4,
        openExceptions: 8,
        criticalExceptions: 2,
        depositsTzsBillions: 120,
        loansTzsBillions: 90,
        completenessPercent: 94,
      },
      trend: [
        { period: '2026-09', depositsTzsBillions: 100, loansTzsBillions: 80, completenessPercent: 90, exceptions: 4 },
        { period: '2026-10', depositsTzsBillions: 120, loansTzsBillions: 90, completenessPercent: 94, exceptions: 8 },
      ],
      recentExceptions: [],
    });

    expect(narrative.headline).toContain('2026-10');
    expect(narrative.headline).toContain('4 institutions');
    expect(narrative.headline).toContain('8 open signals');
    expect(narrative.summary).toContain('120 TZS bn');
    expect(narrative.summary).toContain('75%');
    expect(narrative.summary).toContain('25% of open signals');
    expect(factValue(narrative.facts, 'Loan-to-deposit ratio')).toBe('75%');
    expect(factValue(narrative.facts, 'Deposit change')).toBe('+20 TZS bn');
    expect(factValue(narrative.facts, 'Loan change')).toBe('+10 TZS bn');
    expect(narrative.detail).toContain('2026-09');
    expect(narrative.detail).toContain('2026-10');
    expect(narrative.summary.toLowerCase()).not.toContain('query processed');
  });

  it('narrates exception counts, leaders and the returned page subset', () => {
    const narrative = narrateToolResult('list_exceptions', {
      items: [
        {
          id: 'EXC-1',
          institutionId: 'TZ001',
          institutionName: 'Bank One',
          reportId: 'RPT-1',
          period: '2026-10',
          indicatorId: 'capital_adequacy',
          observedValue: 8.5,
          thresholdValue: 10,
          severity: 'critical',
          status: 'open',
          message: 'Capital adequacy below training boundary.',
          createdAt: '2026-11-01T00:00:00.000Z',
        },
        {
          id: 'EXC-2',
          institutionId: 'TZ004',
          institutionName: 'Bank Four',
          reportId: 'RPT-2',
          period: '2026-09',
          indicatorId: 'npl_ratio',
          observedValue: 9,
          thresholdValue: 8,
          severity: 'high',
          status: 'under_review',
          message: 'NPL ratio above training boundary.',
          createdAt: '2026-10-01T00:00:00.000Z',
        },
      ],
      page: 1,
      pageSize: 10,
      total: 12,
      totalPages: 2,
    });

    expect(narrative.headline).toContain('12 matched');
    expect(narrative.headline).toContain('1 critical');
    expect(narrative.headline).toContain('1 open');
    expect(narrative.summary).toContain('This page shows 2 of 12');
    expect(narrative.summary).toContain('TZ001');
    expect(narrative.summary).toContain('Capital Adequacy');
    expect(narrative.summary).toContain('2026-09');
    expect(narrative.summary).toContain('2026-10');
    expect(narrative.detail).toContain('observed 8.5');
    expect(narrative.detail).toContain('threshold 10');
    expect(factValue(narrative.facts, 'Critical')).toBe('1');
    expect(factValue(narrative.facts, 'Under review')).toBe('1');
    expect(factValue(narrative.facts, 'Top institution')).toBe('Bank One (TZ001)');
  });

  it('narrates institution deltas, ratios and 12-period statistics', () => {
    const narrative = narrateToolResult('get_institution', {
      institution: {
        institutionId: 'TZ004',
        name: 'Bank Four',
        type: 'Commercial bank',
        region: 'Mwanza',
        tier: 'Tier 1',
        status: 'monitoring',
        latestPeriod: '2026-10',
        depositsTzsBillions: 200,
        capitalAdequacyRatioPercent: 11,
        nplRatioPercent: 9,
        openExceptions: 3,
      },
      reports: [
        {
          reportId: 'RPT-2',
          period: '2026-10',
          depositsTzsBillions: 200,
          loansTzsBillions: 150,
          capitalAdequacyRatioPercent: 11,
          liquidityRatioPercent: 120,
          nplRatioPercent: 9,
          completenessPercent: 95,
          sourceRecordIds: [],
        },
        {
          reportId: 'RPT-1',
          period: '2026-09',
          depositsTzsBillions: 180,
          loansTzsBillions: 140,
          capitalAdequacyRatioPercent: 12,
          liquidityRatioPercent: 125,
          nplRatioPercent: 8,
          completenessPercent: 92,
          sourceRecordIds: [],
        },
      ],
      exceptions: [
        {
          id: 'EXC-1',
          institutionId: 'TZ004',
          institutionName: 'Bank Four',
          reportId: 'RPT-2',
          period: '2026-10',
          indicatorId: 'npl_ratio',
          observedValue: 9,
          thresholdValue: 8,
          severity: 'critical',
          status: 'open',
          message: 'NPL above boundary.',
          createdAt: '2026-11-01T00:00:00.000Z',
        },
      ],
    });

    expect(narrative.headline).toContain('Bank Four');
    expect(narrative.headline).toContain('200 TZS bn');
    expect(narrative.summary).toContain('75%');
    expect(narrative.summary).toContain('+20 TZS bn');
    expect(narrative.summary).toContain('-1 pp');
    expect(narrative.summary).toContain('1 critical');
    expect(narrative.detail).toContain('180 TZS bn');
    expect(narrative.detail).toContain('200 TZS bn');
    expect(factValue(narrative.facts, 'Deposits')).toBe('200 TZS bn');
    expect(factValue(narrative.facts, 'Loan-to-deposit ratio')).toBe('75%');
    expect(factValue(narrative.facts, 'Open exceptions')).toBe('1');
    expect(factValue(narrative.facts, 'NPL over 12 periods')).toContain('8% min');
    expect(factValue(narrative.facts, 'NPL over 12 periods')).toContain('9% max');
    expect(factValue(narrative.facts, 'NPL over 12 periods')).toContain('8.5% average');
  });

  it('narrates sector analytics and an institution comparison against the sector', () => {
    const narrative = narrateToolResult('get_analytics', {
      period: '2026-10',
      indicators: [
        { id: 'deposits', label: 'Deposits', unit: 'TZS bn', value: 120, formula: 'sum' },
        { id: 'loans', label: 'Loans', unit: 'TZS bn', value: 90, formula: 'sum' },
        { id: 'npl_ratio', label: 'NPL ratio', unit: '%', value: 7, formula: 'mean' },
        { id: 'capital_adequacy', label: 'Capital adequacy', unit: '%', value: 11, formula: 'mean' },
        { id: 'completeness', label: 'Completeness', unit: '%', value: 94, formula: 'mean' },
      ],
      trend: [
        { period: '2026-09', deposits: 100, loans: 80, completeness: 90 },
        { period: '2026-10', deposits: 120, loans: 90, completeness: 94 },
      ],
      institution: {
        institutionId: 'TZ001',
        name: 'Bank One',
        type: 'Commercial bank',
        region: 'Dar es Salaam',
        tier: 'Tier 1',
        status: 'active',
        latestPeriod: '2026-10',
        depositsTzsBillions: 130,
        capitalAdequacyRatioPercent: 10,
        nplRatioPercent: 8,
        openExceptions: 0,
      },
    });

    expect(narrative.headline).toContain('2026-10');
    expect(narrative.headline).toContain('TZ001');
    expect(narrative.summary).toContain('120 TZS bn');
    expect(narrative.summary).toContain('7%');
    expect(narrative.summary).toContain('TZ001 reports 130 TZS bn');
    expect(narrative.summary).toContain('(difference +10 TZS bn)');
    expect(narrative.summary).toContain('deposits rose by 20 TZS bn');
    expect(factValue(narrative.facts, 'Deposits')).toBe('120 TZS bn');
    expect(factValue(narrative.facts, 'NPL ratio')).toBe('7%');
    expect(factValue(narrative.facts, 'Numeric average')).toBe('64.4');
  });

  it('narrates institution directory counts and extremes', () => {
    const narrative = narrateToolResult('list_institutions', {
      items: [
        {
          institutionId: 'TZ001',
          name: 'Bank One',
          type: 'Commercial bank',
          region: 'Dar es Salaam',
          tier: 'Tier 1',
          status: 'active',
          latestPeriod: '2026-10',
          depositsTzsBillions: 120,
          capitalAdequacyRatioPercent: 12,
          nplRatioPercent: 5,
          openExceptions: 2,
        },
        {
          institutionId: 'TZ004',
          name: 'Bank Four',
          type: 'Community bank',
          region: 'Mwanza',
          tier: 'Tier 2',
          status: 'monitoring',
          latestPeriod: '2026-10',
          depositsTzsBillions: 40,
          capitalAdequacyRatioPercent: 9,
          nplRatioPercent: 9,
          openExceptions: 4,
        },
      ],
      page: 1,
      pageSize: 10,
      total: 2,
      totalPages: 1,
    });

    expect(narrative.headline).toContain('2 matched');
    expect(narrative.headline).toContain('2 regions');
    expect(narrative.summary).toContain('Bank One');
    expect(narrative.summary).toContain('120 TZS bn');
    expect(narrative.summary).toContain('Bank Four');
    expect(narrative.summary).toContain('9%');
    expect(factValue(narrative.facts, 'Active')).toBe('1');
    expect(factValue(narrative.facts, 'Monitoring')).toBe('1');
    expect(factValue(narrative.facts, 'Open signals on page')).toBe('6');
    expect(factValue(narrative.facts, 'Highest deposits')).toBe('Bank One (TZ001)');
    expect(factValue(narrative.facts, 'Highest NPL')).toBe('Bank Four (TZ004)');
    expect(factValue(narrative.facts, 'Lowest capital adequacy')).toBe('Bank Four (TZ004)');
  });

  it('narrates ranking spread, average and null count', () => {
    const narrative = narrateToolResult('rank_institutions', {
      metric: 'deposits',
      order: 'desc',
      totalConsidered: 3,
      items: [
        { institutionId: 'TZ001', name: 'Bank One', region: 'Dar es Salaam', tier: 'Tier 1', status: 'active', value: 10, metric: 'deposits' },
        { institutionId: 'TZ004', name: 'Bank Four', region: 'Mwanza', tier: 'Tier 2', status: 'monitoring', value: 5, metric: 'deposits' },
        { institutionId: 'TZ002', name: 'Bank Two', region: 'Arusha', tier: 'Tier 2', status: 'active', value: null, metric: 'deposits' },
      ],
    });

    expect(narrative.headline).toContain('deposits');
    expect(narrative.headline).toContain('Bank One');
    expect(narrative.summary).toContain('3 institutions');
    expect(narrative.summary).toContain('highest value at 10');
    expect(narrative.summary).toContain('spread of 5');
    expect(narrative.summary).toContain('average across 2 non-null values is 7.5');
    expect(narrative.summary).toContain('1 of 3 rows have no value');
    expect(factValue(narrative.facts, 'Highest')).toBe('Bank One (TZ001)');
    expect(factValue(narrative.facts, 'Lowest')).toBe('Bank Four (TZ004)');
    expect(factValue(narrative.facts, 'Spread')).toBe('5');
    expect(factValue(narrative.facts, 'Average (non-null)')).toBe('7.5');
    expect(factValue(narrative.facts, 'Missing values')).toBe('1 of 3 rows');
  });

  it('narrates comparison extremes, differences and per-institution LDR', () => {
    const narrative = narrateToolResult('compare_institutions', {
      institutions: [
        {
          institutionId: 'TZ001',
          name: 'Bank One',
          type: 'Commercial bank',
          region: 'Dar es Salaam',
          tier: 'Tier 1',
          status: 'active',
          latestPeriod: '2026-10',
          depositsTzsBillions: 100,
          loansTzsBillions: 80,
          capitalAdequacyRatioPercent: 14,
          nplRatioPercent: 4,
          openExceptions: 1,
        },
        {
          institutionId: 'TZ004',
          name: 'Bank Four',
          type: 'Community bank',
          region: 'Mwanza',
          tier: 'Tier 2',
          status: 'monitoring',
          latestPeriod: '2026-10',
          depositsTzsBillions: 60,
          loansTzsBillions: 30,
          capitalAdequacyRatioPercent: 9,
          nplRatioPercent: 10,
          openExceptions: 5,
        },
      ],
    });

    expect(narrative.headline).toContain('Bank One');
    expect(narrative.headline).toContain('100 TZS bn');
    expect(narrative.summary).toContain('Deposits: Bank One (TZ001) highest at 100 TZS bn');
    expect(narrative.summary).toContain('difference 40 TZS bn');
    expect(narrative.summary).toContain('Open exceptions: Bank Four (TZ004) highest at 5');
    expect(narrative.summary).toContain('Bank One (TZ001) 80%');
    expect(narrative.summary).toContain('Bank Four (TZ004) 50%');
    expect(factValue(narrative.facts, 'Bank One (TZ001) LDR')).toBe('80%');
    expect(factValue(narrative.facts, 'Bank Four (TZ004) LDR')).toBe('50%');
    expect(factValue(narrative.facts, 'Highest deposits')).toBe('Bank One (TZ001)');
  });

  it('uses a validated answered text for search and builds extractive summaries otherwise', () => {
    const answered = narrateToolResult('search_corpus', {
      retrievalMode: 'hybrid',
      hits: [
        { kind: 'document', id: 'DOC-1', title: 'Liquidity guidance', excerpt: 'Liquidity buffers are discussed here.', citation: {}, rank: 1 },
        { kind: 'institution', id: 'TZ001', title: 'Bank One', excerpt: 'Deposits reached 120 TZS bn.', citation: {}, rank: 2 },
      ],
      answer: {
        status: 'answered',
        text: 'Deposits reached 120 TZS bn in 2026-10 [S2].',
        citations: [{ sourceId: 'S2', title: 'Bank One', kind: 'institution', citation: {} }],
      },
    });

    expect(answered.headline).toContain('2 matching sources');
    expect(answered.headline).toContain('answer ready');
    expect(answered.summary).toBe('Deposits reached 120 TZS bn in 2026-10 [S2].');
    expect(factValue(answered.facts, 'Sources cited')).toBe('1');

    const unavailable = narrateToolResult('search_corpus', {
      retrievalMode: 'keyword',
      hits: [
        {
          kind: 'document',
          id: 'DOC-1',
          title: 'NPL guidance',
          excerpt: 'The NPL ratio was 9 percent in 2026-10. Training boundaries are illustrative only.',
          citation: {},
          rank: 1,
        },
        {
          kind: 'report',
          id: 'RPT-1',
          title: 'TZ004 report',
          excerpt: 'Deposits rose while capital adequacy held at 11 percent.',
          citation: {},
          rank: 2,
        },
      ],
      answer: {
        status: 'unavailable',
        text: 'The retrieved sources are available below, but the local answer could not be validated.',
        citations: [],
        error: 'The generated answer did not cite any retrieved sources.',
      },
    });

    expect(unavailable.headline).toContain('2 matching sources');
    expect(unavailable.headline).toContain('no direct answer');
    expect(unavailable.summary).toContain('[S1]');
    expect(unavailable.summary).toContain('9 percent');
    expect(unavailable.summary).toContain('[S2]');
    expect(unavailable.detail).toContain('could not be prepared');
    expect(unavailable.summary).not.toContain('query processed');
  });

  it('prioritizes sentences with query tokens and numbers in extractive summaries', () => {
    const narrative = narrateToolResult('search_corpus', {
      retrievalMode: 'keyword',
      query: 'liquidity buffer',
      hits: [
        {
          kind: 'document',
          id: 'DOC-1',
          title: 'Liquidity guidance',
          excerpt: 'This is a general introduction that is long enough to be a sentence. The liquidity buffer rose to 130 percent in 2026-10. Another closing remark that is also long but unrelated.',
          citation: {},
          rank: 1,
        },
      ],
      answer: {
        status: 'no_evidence',
        text: '',
        citations: [],
      },
    });

    expect(narrative.summary).toContain('130 percent');
    expect(narrative.summary).toContain('2026-10');
    expect(narrative.summary).not.toContain('general introduction');
    expect(narrative.summary).not.toContain('query processed');

    const genericAnswer = narrateToolResult('search_corpus', {
      retrievalMode: 'hybrid',
      query: 'liquidity buffer',
      hits: [
        {
          kind: 'document',
          id: 'DOC-1',
          title: 'Liquidity guidance',
          excerpt: 'The liquidity buffer rose to 130 percent in 2026-10.',
          citation: {},
          rank: 1,
        },
      ],
      answer: {
        status: 'answered',
        text: 'The evidence covers the requested topic [S1].',
        citations: [{ sourceId: 'S1', title: 'Liquidity guidance', kind: 'document', citation: {} }],
      },
    });
    expect(genericAnswer.summary).toBe('The evidence covers the requested topic [S1].');
  });

  it('handles empty and missing results without throwing', () => {
    const tools = [
      'get_portfolio_overview',
      'list_exceptions',
      'get_institution',
      'get_analytics',
      'list_institutions',
      'rank_institutions',
      'compare_institutions',
    ];

    for (const tool of tools) {
      const narrative = narrateToolResult(tool, {});
      expect(narrative.headline.trim().length).toBeGreaterThan(0);
      expect(narrative.summary.trim().length).toBeGreaterThan(0);
      expect(Array.isArray(narrative.facts)).toBe(true);
      expect(narrative.followUps.length).toBeGreaterThan(0);
      expect(narrative.summary.toLowerCase()).not.toContain('query processed');
    }

    const emptySearch = narrateToolResult('search_corpus', { hits: [], answer: { status: 'no_evidence', text: '' } });
    expect(emptySearch.headline).toContain('0 sources');
    expect(emptySearch.summary).toContain('No synthetic evidence sources');
  });
});

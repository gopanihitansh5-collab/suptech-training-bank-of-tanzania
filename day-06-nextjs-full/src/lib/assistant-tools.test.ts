import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExceptionRow, InstitutionDetail, InstitutionRow, OverviewData, Page } from './repository';
import {
  getAnalytics,
  getInstitutionDetail,
  getOverview,
  listExceptions,
  listInstitutions,
} from './repository';
import { runTool } from './assistant-tools';
import { searchGroundedEvidence } from './grounded-retrieval';
import { answerFromEvidence } from './grounded-answer';

vi.mock('./repository', () => ({
  getAnalytics: vi.fn(),
  getInstitutionDetail: vi.fn(),
  getOverview: vi.fn(),
  getSemanticCorpus: vi.fn(),
  listExceptions: vi.fn(),
  listInstitutions: vi.fn(),
}));

vi.mock('./grounded-retrieval', () => ({
  searchGroundedEvidence: vi.fn(),
}));

vi.mock('./grounded-answer', () => ({
  answerFromEvidence: vi.fn(),
}));

function institution(overrides: Partial<InstitutionRow>): InstitutionRow {
  return {
    institutionId: 'TZ000',
    name: 'Synthetic Bank',
    type: 'Commercial bank',
    region: 'Dar es Salaam',
    tier: 'Tier 1',
    status: 'active',
    latestPeriod: '2026-10',
    depositsTzsBillions: 10,
    capitalAdequacyRatioPercent: 12,
    nplRatioPercent: 4,
    openExceptions: 0,
    ...overrides,
  };
}

function page(items: InstitutionRow[]): Page<InstitutionRow> {
  return { items, page: 1, pageSize: 50, total: items.length, totalPages: 1 };
}

function detail(row: InstitutionRow): InstitutionDetail {
  return { institution: row, reports: [], exceptions: [] };
}

describe('assistant institution ranking and comparison tools', () => {
  beforeEach(() => {
    vi.mocked(listInstitutions).mockReset();
    vi.mocked(getInstitutionDetail).mockReset();
  });

  it('ranks by the requested metric and keeps null values last in both orders', async () => {
    vi.mocked(listInstitutions).mockResolvedValue(page([
      institution({ institutionId: 'TZ001', name: 'Bank One', depositsTzsBillions: 5 }),
      institution({ institutionId: 'TZ002', name: 'Bank Two', depositsTzsBillions: null }),
      institution({ institutionId: 'TZ003', name: 'Bank Three', depositsTzsBillions: 10 }),
      institution({ institutionId: 'TZ004', name: 'Bank Four', depositsTzsBillions: 2 }),
    ]));

    const descending = await runTool('rank_institutions', { metric: 'deposits', order: 'desc', limit: 4 });
    expect(descending.result).toMatchObject({
      metric: 'deposits',
      order: 'desc',
      totalConsidered: 4,
    });
    expect((descending.result as { items: Array<{ institutionId: string; value: number | null }> }).items)
      .toEqual([
        { institutionId: 'TZ003', name: 'Bank Three', region: 'Dar es Salaam', tier: 'Tier 1', status: 'active', value: 10, metric: 'deposits' },
        { institutionId: 'TZ001', name: 'Bank One', region: 'Dar es Salaam', tier: 'Tier 1', status: 'active', value: 5, metric: 'deposits' },
        { institutionId: 'TZ004', name: 'Bank Four', region: 'Dar es Salaam', tier: 'Tier 1', status: 'active', value: 2, metric: 'deposits' },
        { institutionId: 'TZ002', name: 'Bank Two', region: 'Dar es Salaam', tier: 'Tier 1', status: 'active', value: null, metric: 'deposits' },
      ]);
    expect(descending.summary).toContain('deposits');
    expect(descending.summary).toContain('descending');
    expect(descending.summary).toContain('Bank Three');

    const ascending = await runTool('rank_institutions', { metric: 'deposits', order: 'asc', limit: 4 });
    expect((ascending.result as { items: Array<{ institutionId: string }> }).items.map((item) => item.institutionId))
      .toEqual(['TZ004', 'TZ001', 'TZ003', 'TZ002']);
  });

  it('maps compared institution details into a bounded latest-position list', async () => {
    vi.mocked(getInstitutionDetail).mockImplementation(async (institutionId) =>
      detail(institution({
        institutionId,
        name: `Bank ${institutionId}`,
        type: 'Community bank',
        region: 'Mwanza',
        tier: 'Tier 2',
        status: 'monitoring',
        depositsTzsBillions: 7,
        capitalAdequacyRatioPercent: 11,
        nplRatioPercent: 9,
        openExceptions: 3,
      })),
    );

    const result = await runTool('compare_institutions', { institutionIds: ['tz001', 'TZ004'] });
    expect(getInstitutionDetail).toHaveBeenCalledTimes(2);
    expect(getInstitutionDetail).toHaveBeenNthCalledWith(1, 'TZ001');
    expect(getInstitutionDetail).toHaveBeenNthCalledWith(2, 'TZ004');
    expect(result.result).toEqual({
      institutions: [
        {
          institutionId: 'TZ001',
          name: 'Bank TZ001',
          type: 'Community bank',
          region: 'Mwanza',
          tier: 'Tier 2',
          status: 'monitoring',
          latestPeriod: '2026-10',
          depositsTzsBillions: 7,
          loansTzsBillions: null,
          capitalAdequacyRatioPercent: 11,
          nplRatioPercent: 9,
          liquidityRatioPercent: null,
          openExceptions: 3,
        },
        {
          institutionId: 'TZ004',
          name: 'Bank TZ004',
          type: 'Community bank',
          region: 'Mwanza',
          tier: 'Tier 2',
          status: 'monitoring',
          latestPeriod: '2026-10',
          depositsTzsBillions: 7,
          loansTzsBillions: null,
          capitalAdequacyRatioPercent: 11,
          nplRatioPercent: 9,
          liquidityRatioPercent: null,
          openExceptions: 3,
        },
      ],
    });
    expect(result.summary).toContain('Bank TZ001');
    expect(result.summary).toContain('Bank TZ004');
    expect(result.narrative.headline).toContain('Comparison');
    expect(result.narrative.facts.some((fact) => fact.label.includes('LDR'))).toBe(true);
  });

  it('fails closed on invalid ranking and comparison arguments', async () => {
    await expect(runTool('rank_institutions', { metric: 'liquidity' }))
      .rejects.toThrow('metric must be');
    await expect(runTool('rank_institutions', { order: 'sideways' }))
      .rejects.toThrow('order must be');
    await expect(runTool('rank_institutions', { limit: 26 }))
      .rejects.toThrow('between 1 and 25');
    await expect(runTool('compare_institutions', { institutionIds: ['TZ001'] }))
      .rejects.toThrow('between 2 and 5');
    await expect(runTool('compare_institutions', { institutionIds: ['TZ001', 'bad id'] }))
      .rejects.toThrow('invalid identifier');
    expect(listInstitutions).not.toHaveBeenCalled();
    expect(getInstitutionDetail).not.toHaveBeenCalled();
  });

  it('includes comparison loans and liquidity and ranks by open exceptions', async () => {
    vi.mocked(getInstitutionDetail).mockResolvedValue({
      institution: institution({
        institutionId: 'TZ001',
        name: 'Bank One',
        depositsTzsBillions: 100,
        openExceptions: 4,
      }),
      reports: [
        {
          reportId: 'RPT-TZ001-2026-10',
          period: '2026-10',
          depositsTzsBillions: 100,
          loansTzsBillions: 80,
          capitalAdequacyRatioPercent: 12,
          liquidityRatioPercent: 130,
          nplRatioPercent: 5,
          completenessPercent: 95,
          sourceRecordIds: [],
        },
      ],
      exceptions: [],
    });

    const comparison = await runTool('compare_institutions', { institutionIds: ['TZ001', 'TZ002'] });
    const first = (comparison.result as {
      institutions: Array<{
        loansTzsBillions: number | null;
        liquidityRatioPercent: number | null;
      }>;
    }).institutions[0];
    expect(first.loansTzsBillions).toBe(80);
    expect(first.liquidityRatioPercent).toBe(130);

    vi.mocked(listInstitutions).mockResolvedValue(page([
      institution({ institutionId: 'TZ001', name: 'Bank One', openExceptions: 2 }),
      institution({ institutionId: 'TZ004', name: 'Bank Four', openExceptions: 6 }),
    ]));
    const ranking = await runTool('rank_institutions', { metric: 'open_exceptions', order: 'desc' });
    expect(ranking.result).toMatchObject({ metric: 'open_exceptions', order: 'desc' });
    expect((ranking.result as {
      items: Array<{ institutionId: string; value: number; metric: string }>;
    }).items[0]).toMatchObject({
      institutionId: 'TZ004',
      value: 6,
      metric: 'open_exceptions',
    });
  });
});

function exceptionRow(overrides: Partial<ExceptionRow>): ExceptionRow {
  return {
    id: 'EXC-TRN-CAR-LOW-TZ001-2026-10',
    institutionId: 'TZ001',
    institutionName: 'Bank One',
    reportId: 'RPT-TZ001-2026-10',
    period: '2026-10',
    indicatorId: 'capital_adequacy',
    observedValue: 8.5,
    thresholdValue: 10,
    severity: 'critical',
    status: 'open',
    message: 'Capital adequacy below training boundary.',
    createdAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('assistant tool narratives', () => {
  beforeEach(() => {
    vi.mocked(getOverview).mockReset();
    vi.mocked(listExceptions).mockReset();
    vi.mocked(getInstitutionDetail).mockReset();
    vi.mocked(getAnalytics).mockReset();
    vi.mocked(listInstitutions).mockReset();
    vi.mocked(searchGroundedEvidence).mockReset();
    vi.mocked(answerFromEvidence).mockReset();
  });

  it('attaches a non-empty narrative with a headline to every tool result', async () => {
    const overview: OverviewData = {
      period: '2026-10',
      summary: {
        institutions: 4,
        reportsReceived: 4,
        reportsExpected: 4,
        openExceptions: 6,
        criticalExceptions: 2,
        depositsTzsBillions: 120,
        loansTzsBillions: 90,
        completenessPercent: 94,
      },
      trend: [
        { period: '2026-09', depositsTzsBillions: 100, loansTzsBillions: 80, completenessPercent: 90, exceptions: 4 },
        { period: '2026-10', depositsTzsBillions: 120, loansTzsBillions: 90, completenessPercent: 94, exceptions: 6 },
      ],
      recentExceptions: [],
    };
    vi.mocked(getOverview).mockResolvedValue(overview);
    vi.mocked(listExceptions).mockResolvedValue({
      items: [exceptionRow({}), exceptionRow({ id: 'EXC-2', severity: 'high', status: 'under_review', institutionId: 'TZ004', institutionName: 'Bank Four', indicatorId: 'npl_ratio', observedValue: 9, thresholdValue: 8 })],
      page: 1,
      pageSize: 10,
      total: 12,
      totalPages: 2,
    });
    vi.mocked(getInstitutionDetail).mockResolvedValue({
      institution: institution({ institutionId: 'TZ001', name: 'Bank One', depositsTzsBillions: 120 }),
      reports: [
        {
          reportId: 'RPT-TZ001-2026-10',
          period: '2026-10',
          depositsTzsBillions: 120,
          loansTzsBillions: 90,
          capitalAdequacyRatioPercent: 11,
          liquidityRatioPercent: 130,
          nplRatioPercent: 7,
          completenessPercent: 95,
          sourceRecordIds: [],
        },
        {
          reportId: 'RPT-TZ001-2026-09',
          period: '2026-09',
          depositsTzsBillions: 100,
          loansTzsBillions: 80,
          capitalAdequacyRatioPercent: 12,
          liquidityRatioPercent: 128,
          nplRatioPercent: 8,
          completenessPercent: 92,
          sourceRecordIds: [],
        },
      ],
      exceptions: [exceptionRow({})],
    });
    vi.mocked(getAnalytics).mockResolvedValue({
      period: '2026-10',
      indicators: [
        { id: 'deposits', label: 'Deposits', unit: 'TZS bn', value: 120, formula: 'sum' },
        { id: 'npl_ratio', label: 'NPL ratio', unit: '%', value: 7, formula: 'mean' },
      ],
      trend: [
        { period: '2026-09', deposits: 100, loans: 80, completeness: 90 },
        { period: '2026-10', deposits: 120, loans: 90, completeness: 94 },
      ],
    });
    vi.mocked(listInstitutions).mockResolvedValue(page([
      institution({ institutionId: 'TZ001', name: 'Bank One', depositsTzsBillions: 120, nplRatioPercent: 7, capitalAdequacyRatioPercent: 11, openExceptions: 2 }),
      institution({ institutionId: 'TZ004', name: 'Bank Four', depositsTzsBillions: 40, nplRatioPercent: 9, capitalAdequacyRatioPercent: 9, openExceptions: 4 }),
    ]));
    vi.mocked(searchGroundedEvidence).mockResolvedValue({
      mode: 'keyword',
      hits: [
        {
          kind: 'document',
          id: 'DOC-1',
          title: 'Liquidity guidance',
          excerpt: 'Deposits rose 5 percent in 2026-10 while the NPL ratio held at 7 percent.',
          citation: { documentId: 'DOC-1', chunkIndex: 0 },
          rank: 1,
        },
      ],
    });
    vi.mocked(answerFromEvidence).mockResolvedValue({
      status: 'no_evidence',
      text: 'I could not find matching evidence in the synthetic training corpus.',
      citations: [],
    });

    const results = await Promise.all([
      runTool('get_portfolio_overview', { period: '2026-10' }),
      runTool('list_exceptions', { period: '2026-10' }),
      runTool('get_institution', { institutionId: 'TZ001' }),
      runTool('get_analytics', { period: '2026-10' }),
      runTool('list_institutions', { limit: 10 }),
      runTool('rank_institutions', { metric: 'deposits', order: 'desc', limit: 5 }),
      runTool('compare_institutions', { institutionIds: ['TZ001', 'TZ004'] }),
      runTool('search_corpus', { query: 'deposit trend' }),
    ]);

    for (const result of results) {
      expect(result.narrative).toBeDefined();
      expect(result.narrative.headline.trim().length).toBeGreaterThan(0);
      expect(result.narrative.summary.trim().length).toBeGreaterThan(0);
      expect(Array.isArray(result.narrative.facts)).toBe(true);
      expect(result.narrative.followUps.length).toBeGreaterThan(0);
      expect(result.narrative.summary.toLowerCase()).not.toContain('query processed');
    }
  });
});

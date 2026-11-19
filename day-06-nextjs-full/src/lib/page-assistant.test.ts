import { beforeEach, describe, expect, it, vi } from 'vitest';

const repositoryMocks = vi.hoisted(() => ({
  getAnalytics: vi.fn(),
  getDataExplorerStats: vi.fn(),
  getInstitutionDetail: vi.fn(),
  getOverview: vi.fn(),
  listExceptions: vi.fn(),
  listInstitutions: vi.fn(),
  listReports: vi.fn(),
}));

const providerMocks = vi.hoisted(() => ({
  generateChatCompletion: vi.fn(),
  getActiveChatProviderName: vi.fn(),
  getChatModelId: vi.fn(),
}));

vi.mock('./repository', () => repositoryMocks);
vi.mock('./model-provider', async () => {
  const actual = await vi.importActual<typeof import('./model-provider')>('./model-provider');
  return { ...actual, ...providerMocks };
});

import {
  answerPageAssistantQuestion,
  buildPageAssistantContext,
  validatePageAssistantHistory,
} from './page-assistant';
import { RequestValidationError } from './api-errors';

const overview = {
  period: '2026-10',
  summary: {
    institutions: 14,
    reportsReceived: 13,
    reportsExpected: 14,
    openExceptions: 3,
    criticalExceptions: 1,
    depositsTzsBillions: 1200,
    loansTzsBillions: 820,
    completenessPercent: 92.5,
  },
  trend: [
    {
      period: '2026-09',
      depositsTzsBillions: 1150,
      loansTzsBillions: 790,
      completenessPercent: 90,
      exceptions: 4,
    },
    {
      period: '2026-10',
      depositsTzsBillions: 1200,
      loansTzsBillions: 820,
      completenessPercent: 92.5,
      exceptions: 3,
    },
  ],
  recentExceptions: [],
};

const analytics = {
  period: '2026-10',
  indicators: [
    {
      id: 'npl_ratio',
      label: 'NPL ratio',
      unit: '%',
      value: 4.2,
      formula: 'internal formula',
    },
  ],
  trend: [
    {
      period: '2026-10',
      deposits: 1200,
      loans: 820,
      completeness: 92.5,
    },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  repositoryMocks.getOverview.mockResolvedValue(overview);
  repositoryMocks.getAnalytics.mockResolvedValue(analytics);
  repositoryMocks.listInstitutions.mockResolvedValue({
    items: [],
    page: 1,
    pageSize: 50,
    total: 0,
    totalPages: 0,
  });
  repositoryMocks.getDataExplorerStats.mockResolvedValue({
    institutions: 14,
    reports: 168,
    indicators: 120,
    reviewSignals: 23,
    latestPeriod: '2026-10',
  });
  providerMocks.getActiveChatProviderName.mockReturnValue('groq');
  providerMocks.getChatModelId.mockReturnValue('openai/gpt-oss-120b');
});

describe('buildPageAssistantContext', () => {
  it('builds page- and filter-specific aggregate evidence without exposing record details', async () => {
    const context = await buildPageAssistantContext('/analytics', {
      period: '2026-10',
      indicator: 'npl_ratio',
    });

    expect(context.pageLabel).toBe('Supervisory analytics');
    expect(context.period).toBe('2026-10');
    expect(context.facts).toContainEqual({
      id: expect.any(String),
      label: 'Indicator: NPL ratio (%)',
      value: '4.2',
    });
    expect(JSON.stringify(context)).not.toContain('institutionId');
    expect(JSON.stringify(context)).not.toContain('reportId');
    expect(repositoryMocks.getAnalytics).toHaveBeenCalledWith('2026-10', 'npl_ratio');
  });

  it('aggregates an institution history and omits names, identifiers, and source row ids', async () => {
    repositoryMocks.getInstitutionDetail.mockResolvedValue({
      institution: {
        institutionId: 'TZ004',
        name: 'Confidential Synthetic Bank Name',
        type: 'commercial_bank',
        region: 'Training region',
        tier: 'Tier 1',
        status: 'active',
        latestPeriod: '2026-10',
        depositsTzsBillions: 20,
        capitalAdequacyRatioPercent: 15,
        nplRatioPercent: 4,
        openExceptions: 2,
      },
      reports: [
        {
          reportId: 'REPORT-SECRET',
          period: '2026-10',
          depositsTzsBillions: 20,
          loansTzsBillions: 12,
          capitalAdequacyRatioPercent: 15,
          liquidityRatioPercent: 110,
          nplRatioPercent: 4,
          completenessPercent: 95,
          sourceRecordIds: ['ROW-SECRET'],
        },
      ],
      exceptions: [],
    });

    const context = await buildPageAssistantContext('/institutions/TZ004');
    const serialized = JSON.stringify(context);

    expect(serialized).not.toContain('Confidential Synthetic Bank Name');
    expect(serialized).not.toContain('TZ004');
    expect(serialized).not.toContain('REPORT-SECRET');
    expect(serialized).not.toContain('ROW-SECRET');
    expect(context.facts).toContainEqual({
      id: expect.any(String),
      label: 'Average deposits across reporting history (TZS bn)',
      value: '20',
    });
  });

  it('rejects unsupported routes, filters, and small-period typos', async () => {
    await expect(buildPageAssistantContext('/unknown')).rejects.toThrow(
      RequestValidationError,
    );
    await expect(buildPageAssistantContext('/analytics', { userId: 'u1' })).rejects.toThrow(
      'unsupported filter',
    );
    await expect(buildPageAssistantContext('/analytics', { period: '2026-13' })).rejects.toThrow(
      'YYYY-MM',
    );
  });
});

describe('answerPageAssistantQuestion', () => {
  const context = {
    pageLabel: 'Executive overview',
    scope: 'Executive overview',
    period: '2026-10',
    facts: [
      { id: 'A1', label: 'Portfolio deposits (TZS bn)', value: '1,200' },
      { id: 'A2', label: 'Open review signals', value: '3' },
    ],
  };

  it('sends each new question with the same bounded context and validates citations', async () => {
    providerMocks.generateChatCompletion
      .mockResolvedValueOnce('Portfolio deposits are 1,200 TZS bn [A1].')
      .mockResolvedValueOnce('There are 3 open review signals [A2].');

    const deposits = await answerPageAssistantQuestion({
      question: 'How much are deposits?',
      context,
    });
    const signals = await answerPageAssistantQuestion({
      question: 'How many open review signals?',
      context,
    });

    expect(deposits.answer).not.toBe(signals.answer);
    expect(deposits.citations.map(({ id }) => id)).toEqual(['A1']);
    expect(signals.citations.map(({ id }) => id)).toEqual(['A2']);
    expect(providerMocks.generateChatCompletion.mock.calls[0][0].at(-1)?.content)
      .toBe('How much are deposits?');
    expect(providerMocks.generateChatCompletion.mock.calls[1][0].at(-1)?.content)
      .toBe('How many open review signals?');
  });

  it('formats answers as clean plain text without Markdown markers', async () => {
    providerMocks.generateChatCompletion.mockResolvedValue(
      '### Summary\n\n**Deposits:** 1,200 TZS bn [A1].\n* Open signals: 3 [A2].',
    );

    const result = await answerPageAssistantQuestion({
      question: 'Summarize deposits and open signals.',
      context,
    });

    expect(result.answer).toBe(
      'Summary\n\nDeposits: 1,200 TZS bn [A1].\nOpen signals: 3 [A2].',
    );
    expect(result.answer).not.toMatch(/[#*]/);
  });

  it('uses an evidence-based fallback for fabricated citations or unsupported numbers', async () => {
    providerMocks.generateChatCompletion
      .mockResolvedValueOnce('Deposits are 1,200 TZS bn [A99].')
      .mockResolvedValueOnce('Deposits are 9,900 TZS bn [A1].');

    const fabricatedCitation = await answerPageAssistantQuestion({
      question: 'How much are deposits?',
      context,
    });
    const fabricatedNumber = await answerPageAssistantQuestion({
      question: 'How much are deposits?',
      context,
    });

    expect(fabricatedCitation.mode).toBe('deterministic_fallback');
    expect(fabricatedNumber.mode).toBe('deterministic_fallback');
    expect(fabricatedNumber.answer).toContain('1,200');
  });

  it('limits conversation context to two recent messages', () => {
    expect(() => validatePageAssistantHistory([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'second' },
      { role: 'user', content: 'third' },
    ])).toThrow('at most two');
    expect(() => validatePageAssistantHistory([
      { role: 'system', content: 'not allowed' },
    ])).toThrow('invalid message');
  });
});

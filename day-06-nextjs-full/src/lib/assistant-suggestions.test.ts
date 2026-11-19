import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExceptionRow, InstitutionRow, OverviewData, Page } from './repository';
import { getAnalytics, getOverview, listExceptions, listInstitutions } from './repository';
import { buildAssistantSuggestions } from './assistant-suggestions';

vi.mock('./repository', () => ({
  getAnalytics: vi.fn(),
  getOverview: vi.fn(),
  listExceptions: vi.fn(),
  listInstitutions: vi.fn(),
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

function institutionPage(items: InstitutionRow[]): Page<InstitutionRow> {
  return { items, page: 1, pageSize: 50, total: items.length, totalPages: 1 };
}

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

const overview: OverviewData = {
  period: '2026-10',
  summary: {
    institutions: 2,
    reportsReceived: 2,
    reportsExpected: 2,
    openExceptions: 7,
    criticalExceptions: 2,
    depositsTzsBillions: 120,
    loansTzsBillions: 90,
    completenessPercent: 94,
  },
  trend: [
    { period: '2026-09', depositsTzsBillions: 100, loansTzsBillions: 80, completenessPercent: 90, exceptions: 4 },
    { period: '2026-10', depositsTzsBillions: 120, loansTzsBillions: 90, completenessPercent: 94, exceptions: 7 },
  ],
  recentExceptions: [],
};

function primeMocks(): void {
  vi.mocked(getOverview).mockResolvedValue(overview);
  vi.mocked(listInstitutions).mockResolvedValue(institutionPage([
    institution({ institutionId: 'TZ001', name: 'Bank One', openExceptions: 4 }),
    institution({ institutionId: 'TZ002', name: 'Bank Two', openExceptions: 3 }),
  ]));
  vi.mocked(listExceptions).mockResolvedValue({
    items: [exceptionRow({})],
    page: 1,
    pageSize: 5,
    total: 12,
    totalPages: 3,
  });
  vi.mocked(getAnalytics).mockResolvedValue({
    period: '2026-10',
    indicators: [
      { id: 'capital_adequacy', label: 'Capital adequacy', unit: '%', value: 11, formula: 'mean' },
      { id: 'npl_ratio', label: 'Non-performing loan ratio', unit: '%', value: 7, formula: 'mean' },
    ],
    trend: [
      { period: '2026-09', deposits: 100, loans: 80, completeness: 90 },
      { period: '2026-10', deposits: 120, loans: 90, completeness: 94 },
    ],
  });
}

describe('assistant suggestions', () => {
  beforeEach(() => {
    vi.mocked(getOverview).mockReset();
    vi.mocked(listInstitutions).mockReset();
    vi.mocked(listExceptions).mockReset();
    vi.mocked(getAnalytics).mockReset();
  });

  it('builds data-specific suggestions and completions from repository records', async () => {
    primeMocks();

    const result = await buildAssistantSuggestions();

    expect(result.generatedAt).toBeTruthy();
    expect(result.suggestions.length).toBeGreaterThanOrEqual(8);
    expect(result.suggestions).toContain('Summarize the portfolio for 2026-10');
    expect(result.suggestions).toContain('Compare deposits for TZ001 and TZ002');
    expect(result.suggestions).toContain('Explain why Bank One was flagged for Capital adequacy');
    expect(result.suggestions).toContain('List critical open exceptions for 2026-10');
    expect(result.suggestions.some((suggestion) => suggestion.includes('12 open exceptions'))).toBe(true);
    expect(result.suggestions).toContain('Rank institutions by capital adequacy');

    expect(result.completions.length).toBeLessThanOrEqual(12);
    expect(result.completions).toContainEqual({
      type: 'institution',
      value: 'TZ001',
      label: 'Bank One (TZ001)',
    });
    expect(result.completions).toContainEqual({
      type: 'indicator',
      value: 'Capital adequacy',
      label: 'Capital adequacy (capital_adequacy)',
    });
    expect(result.completions).toContainEqual({
      type: 'period',
      value: '2026-10',
      label: '2026-10',
    });
    expect(result.completions.some((completion) => completion.type === 'question')).toBe(true);
  });

  it('filters completions case-insensitively and caps them at eight', async () => {
    primeMocks();

    const byInstitution = await buildAssistantSuggestions('bank');
    expect(byInstitution.completions.length).toBeGreaterThan(0);
    expect(byInstitution.completions.length).toBeLessThanOrEqual(8);
    expect(byInstitution.completions.every((completion) =>
      completion.value.toLowerCase().includes('bank') ||
      completion.label.toLowerCase().includes('bank'),
    )).toBe(true);

    const byPeriod = await buildAssistantSuggestions('2026-10');
    expect(byPeriod.completions.some((completion) => completion.type === 'period')).toBe(true);
    expect(byPeriod.completions.length).toBeLessThanOrEqual(8);

    const byIndicator = await buildAssistantSuggestions('capital');
    expect(byIndicator.completions).toContainEqual({
      type: 'indicator',
      value: 'Capital adequacy',
      label: 'Capital adequacy (capital_adequacy)',
    });
  });

  it('returns a safe generic fallback when repository access fails', async () => {
    vi.mocked(getOverview).mockRejectedValue(new Error('database unavailable'));
    vi.mocked(listInstitutions).mockRejectedValue(new Error('database unavailable'));
    vi.mocked(listExceptions).mockRejectedValue(new Error('database unavailable'));
    vi.mocked(getAnalytics).mockRejectedValue(new Error('database unavailable'));

    const result = await buildAssistantSuggestions('unable');

    expect(result.suggestions).toHaveLength(4);
    expect(result.completions).toEqual([]);
    expect(result.suggestions.every((suggestion) => suggestion.trim().length > 0)).toBe(true);
  });
});

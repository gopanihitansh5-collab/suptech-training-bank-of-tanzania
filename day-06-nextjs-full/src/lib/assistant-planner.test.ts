import { describe, expect, it } from 'vitest';
import { runTool } from './assistant-tools';
import { planAssistantQuestion } from './assistant-planner';

describe('assistant query planner', () => {
  it('creates a bounded portfolio overview plan for a selected period', () => {
    expect(planAssistantQuestion('Summarize portfolio for 2026-10')).toMatchObject({
      tool: 'get_portfolio_overview',
      arguments: { period: '2026-10' },
      source: expect.stringContaining('synthetic'),
    });
  });

  it('plans exception filters without executing the query', () => {
    expect(planAssistantQuestion('Show high open exceptions for TZ004 in 2026-10')).toMatchObject({
      tool: 'list_exceptions',
      arguments: {
        status: 'open',
        severity: 'high',
        institutionId: 'TZ004',
        period: '2026-10',
        limit: 10,
      },
    });
  });

  it('maps common NPL wording to the allowlisted indicator', () => {
    expect(planAssistantQuestion('Show NPL ratio analytics for 2026-10')).toMatchObject({
      tool: 'get_analytics',
      arguments: { indicatorId: 'npl_ratio', period: '2026-10' },
    });
  });

  it('rejects invalid periods and falls back to evidence search for unmatched questions', () => {
    expect(planAssistantQuestion('Tell me a story')).toMatchObject({
      tool: 'search_corpus',
      arguments: { query: 'Tell me a story' },
    });
    expect(() => planAssistantQuestion('Show portfolio for 2026-13'))
      .toThrow('valid reporting period');
  });

  it('routes growth, trend and change questions to analytics', () => {
    expect(planAssistantQuestion('How did deposits change over time?')).toMatchObject({
      tool: 'get_analytics',
      arguments: { indicatorId: 'deposits' },
    });
    expect(planAssistantQuestion('Show the NPL trend for TZ004 in 2026-10')).toMatchObject({
      tool: 'get_analytics',
      arguments: { indicatorId: 'npl_ratio', institutionId: 'TZ004', period: '2026-10' },
    });
    expect(planAssistantQuestion('Did completeness increase over time?')).toMatchObject({
      tool: 'get_analytics',
      arguments: { indicatorId: 'completeness' },
    });
  });

  it('routes institution ranking phrasing without hijacking exception lists', () => {
    expect(planAssistantQuestion('Which institution has the highest NPL ratio?')).toMatchObject({
      tool: 'rank_institutions',
      arguments: { metric: 'npl_ratio', order: 'desc' },
    });
    expect(planAssistantQuestion('Which institution has the lowest capital adequacy?')).toMatchObject({
      tool: 'rank_institutions',
      arguments: { metric: 'capital_adequacy', order: 'asc' },
    });
    expect(planAssistantQuestion('Bottom institutions by deposits')).toMatchObject({
      tool: 'rank_institutions',
      arguments: { metric: 'deposits', order: 'asc' },
    });
    expect(planAssistantQuestion('Show the top 5 open exceptions')).toMatchObject({
      tool: 'list_exceptions',
      arguments: { status: 'open' },
    });
  });

  it('plans exception breakdowns and portfolio breakdowns separately', () => {
    expect(planAssistantQuestion('Breakdown of open exceptions by severity for 2026-10')).toMatchObject({
      tool: 'list_exceptions',
      arguments: { status: 'open', period: '2026-10' },
    });
    expect(planAssistantQuestion('How many exceptions by status?')).toMatchObject({
      tool: 'list_exceptions',
    });
    expect(planAssistantQuestion('Distribution of reporting completeness by status')).toMatchObject({
      tool: 'get_portfolio_overview',
    });
  });

  it('plans comparison for multiple institution identifiers without the word compare', () => {
    expect(planAssistantQuestion('TZ001 and TZ004')).toMatchObject({
      tool: 'compare_institutions',
      arguments: { institutionIds: ['TZ001', 'TZ004'] },
    });
    expect(planAssistantQuestion('TZ002 TZ003 TZ005')).toMatchObject({
      tool: 'compare_institutions',
      arguments: { institutionIds: ['TZ002', 'TZ003', 'TZ005'] },
    });
    expect(planAssistantQuestion('TZ004')).toMatchObject({
      tool: 'get_institution',
      arguments: { institutionId: 'TZ004' },
    });
  });

  it('plans institution ranking with metric and order aliases', () => {
    expect(planAssistantQuestion('Rank institutions by NPL ratio highest first')).toMatchObject({
      tool: 'rank_institutions',
      arguments: { metric: 'npl_ratio', order: 'desc' },
      source: expect.stringContaining('synthetic'),
    });
    expect(planAssistantQuestion('Show the lowest deposits institutions')).toMatchObject({
      tool: 'rank_institutions',
      arguments: { metric: 'deposits', order: 'asc' },
    });
    expect(planAssistantQuestion('Top institutions by CAR')).toMatchObject({
      tool: 'rank_institutions',
      arguments: { metric: 'capital_adequacy', order: 'desc' },
    });
  });

  it('plans institution comparison only when two or more identifiers are present', () => {
    expect(planAssistantQuestion('Compare TZ001 versus TZ004')).toMatchObject({
      tool: 'compare_institutions',
      arguments: { institutionIds: ['TZ001', 'TZ004'] },
      source: expect.stringContaining('synthetic'),
    });
    expect(planAssistantQuestion('Compare TZ001').tool).not.toBe('compare_institutions');
    expect(() => planAssistantQuestion('Compare TZ001 vs TZ002 vs TZ003 vs TZ004 vs TZ005 vs TZ006'))
      .toThrow('between 2 and 5');
  });

  it('rejects unlisted tool arguments and oversized searches before data access', async () => {
    await expect(runTool('list_institutions', { search: 'TZ004', sql: 'SELECT 1' }))
      .rejects.toThrow('unsupported field');
    await expect(runTool('list_institutions', { search: 'x'.repeat(201) }))
      .rejects.toThrow('must not exceed 200 characters');
  });

  it('marks inferred latest periods and default exception status', () => {
    expect(planAssistantQuestion('Summarize the portfolio')).toMatchObject({
      tool: 'get_portfolio_overview',
      arguments: {},
      inferred: { period: 'latest available period' },
    });
    expect(planAssistantQuestion('Show the NPL trend')).toMatchObject({
      tool: 'get_analytics',
      arguments: { indicatorId: 'npl_ratio' },
      inferred: { period: 'latest available period' },
    });
    expect(planAssistantQuestion('Show exceptions')).toMatchObject({
      tool: 'list_exceptions',
      arguments: { status: 'open' },
      inferred: { status: 'open', period: 'latest available period' },
    });
    expect(planAssistantQuestion('Show resolved exceptions for 2026-10').inferred)
      .toBeUndefined();
    expect(planAssistantQuestion('Summarize the portfolio for 2026-10').inferred)
      .toBeUndefined();
  });

  it('routes exception rankings, comparison, corpus and rolling-period questions', () => {
    expect(planAssistantQuestion('Which institutions have the most open exceptions?')).toMatchObject({
      tool: 'rank_institutions',
      arguments: { metric: 'open_exceptions', order: 'desc' },
    });
    expect(planAssistantQuestion('Highest number of exceptions')).toMatchObject({
      tool: 'rank_institutions',
      arguments: { metric: 'open_exceptions', order: 'desc' },
    });
    expect(planAssistantQuestion('Which institutions have the fewest open exceptions?')).toMatchObject({
      tool: 'rank_institutions',
      arguments: { metric: 'open_exceptions', order: 'asc' },
    });
    expect(planAssistantQuestion('Compare deposits for TZ001 and TZ002')).toMatchObject({
      tool: 'compare_institutions',
      arguments: { institutionIds: ['TZ001', 'TZ002'] },
    });
    expect(planAssistantQuestion('Find documents about capital adequacy')).toMatchObject({
      tool: 'search_corpus',
    });
    expect(planAssistantQuestion('Summarise the uploaded circular')).toMatchObject({
      tool: 'search_corpus',
    });
    expect(planAssistantQuestion('Show the NPL trend for the last 12 periods')).toMatchObject({
      tool: 'get_analytics',
      arguments: { indicatorId: 'npl_ratio' },
      inferred: { period: 'latest available period' },
    });
    expect(planAssistantQuestion('Show the top 5 open exceptions')).toMatchObject({
      tool: 'list_exceptions',
      arguments: { status: 'open' },
    });
  });

  it('routes institution history calculations to the full institution evidence', () => {
    expect(planAssistantQuestion(
      'What is the average capital ratio for TZ004 from June to October 2026?',
    ).tool).toBe('get_institution');
  });
});

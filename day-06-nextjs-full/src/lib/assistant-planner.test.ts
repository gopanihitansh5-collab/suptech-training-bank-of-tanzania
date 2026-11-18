import { describe, expect, it } from 'vitest';
import { RequestValidationError } from './api-errors';
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

  it('rejects unsupported questions and invalid periods explicitly', () => {
    expect(() => planAssistantQuestion('Tell me a story')).toThrow(RequestValidationError);
    expect(() => planAssistantQuestion('Show portfolio for 2026-13'))
      .toThrow('valid reporting period');
  });

  it('rejects unlisted tool arguments and oversized searches before data access', async () => {
    await expect(runTool('list_institutions', { search: 'TZ004', sql: 'SELECT 1' }))
      .rejects.toThrow('unsupported field');
    await expect(runTool('list_institutions', { search: 'x'.repeat(201) }))
      .rejects.toThrow('must not exceed 200 characters');
  });
});

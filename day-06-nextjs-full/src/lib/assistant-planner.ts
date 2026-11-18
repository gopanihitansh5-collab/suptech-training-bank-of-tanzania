import { RequestValidationError } from './api-errors';
import { INDICATOR_DEFINITIONS } from './catalog';
import type { ToolName } from './assistant-tools';

export interface AssistantPlan {
  tool: ToolName;
  arguments: Record<string, unknown>;
  purpose: string;
  source: string;
  confirmation: string;
}

function extractPeriod(question: string): string | undefined {
  const match = question.match(/\b\d{4}-\d{2}\b/);
  if (!match) return undefined;
  const period = match[0];
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    throw new RequestValidationError('Use a valid reporting period in YYYY-MM format.');
  }
  return period;
}

function extractInstitutionId(question: string): string | undefined {
  return question.match(/\b[A-Z]{2}\d{3}\b/i)?.[0]?.toUpperCase();
}

function extractIndicatorId(question: string): string | undefined {
  const normalized = question.toLowerCase();
  const definitionMatch = INDICATOR_DEFINITIONS.find((indicator) =>
    normalized.includes(indicator.id) ||
    normalized.includes(indicator.label.toLowerCase()),
  );
  if (definitionMatch) return definitionMatch.id;

  const aliases: Array<[string, string]> = [
    ['npl', 'npl_ratio'],
    ['car', 'capital_adequacy'],
    ['loan-to-deposit', 'loan_to_deposit'],
    ['ltv', 'loan_to_deposit'],
  ];
  return aliases.find(([alias]) => normalized.includes(alias))?.[1];
}

function plan(
  tool: ToolName,
  args: Record<string, unknown>,
  purpose: string,
  source: string,
): AssistantPlan {
  return {
    tool,
    arguments: args,
    purpose,
    source,
    confirmation: 'Run this read-only query on the synthetic training dataset?',
  };
}

export function planAssistantQuestion(question: string): AssistantPlan {
  const normalized = question.trim().toLowerCase();
  if (normalized.length < 2 || normalized.length > 200) {
    throw new RequestValidationError('Enter a question between 2 and 200 characters.');
  }

  const period = extractPeriod(normalized);
  const institutionId = extractInstitutionId(question);

  if (/\b(exception|exceptions|alert|alerts|signal|signals)\b/.test(normalized)) {
    const severity = ['critical', 'high', 'medium', 'low'].find((value) =>
      new RegExp(`\\b${value}\\b`).test(normalized),
    );
    const status = ['open', 'under_review', 'resolved'].find((value) =>
      normalized.includes(value.replace('_', ' ')) || normalized.includes(value),
    );
    return plan(
      'list_exceptions',
      {
        ...(status ? { status } : { status: 'open' }),
        ...(severity ? { severity } : {}),
        ...(institutionId ? { institutionId } : {}),
        ...(period ? { period } : {}),
        limit: 10,
      },
      'List matching synthetic review signals with their source reports.',
      'Persisted synthetic exception records and linked institution reports.',
    );
  }

  if (institutionId && /\b(institution|profile|history|report|details?)\b/.test(normalized)) {
    return plan(
      'get_institution',
      { institutionId },
      `Inspect the synthetic institution ${institutionId}, its reports and review signals.`,
      'Persisted synthetic institution and report records.',
    );
  }

  if (/\b(overview|portfolio|summary|totals?)\b/.test(normalized)) {
    return plan(
      'get_portfolio_overview',
      period ? { period } : {},
      'Summarize portfolio totals and reporting completeness for one period.',
      'Persisted synthetic reports and training review signals.',
    );
  }

  if (/\b(analytics|indicator|ratio|trend|growth|npl|capital|liquidity|completeness)\b/.test(normalized)) {
    const indicatorId = extractIndicatorId(normalized);
    return plan(
      'get_analytics',
      {
        ...(period ? { period } : {}),
        ...(institutionId ? { institutionId } : {}),
        ...(indicatorId ? { indicatorId } : {}),
      },
      indicatorId
        ? `Review the ${indicatorId} indicator and its available trend.`
        : 'Review synthetic indicator values and available portfolio trends.',
      'Persisted synthetic supervisory indicators and source reports.',
    );
  }

  if (/\b(institution|institutions|directory|register)\b/.test(normalized)) {
    return plan(
      'list_institutions',
      institutionId ? { search: institutionId, limit: 10 } : { limit: 10 },
      'List matching synthetic institutions from the directory.',
      'Persisted synthetic institution register.',
    );
  }

  throw new RequestValidationError(
    'I can plan an overview, exception list, institution lookup, analytics query or institution search. Try one of the suggested questions.',
  );
}

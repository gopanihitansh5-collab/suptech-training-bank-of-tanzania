import { RequestValidationError } from './api-errors';
import { INDICATOR_DEFINITIONS } from './catalog';
import type { ToolName } from './assistant-tools';

export interface AssistantPlan {
  tool: ToolName;
  arguments: Record<string, unknown>;
  purpose: string;
  source: string;
  confirmation: string;
  inferred?: Record<string, string>;
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

function extractAllInstitutionIds(question: string): string[] {
  const matches = question.match(/\b[A-Z]{2}\d{3}\b/gi) ?? [];
  return [...new Set(matches.map((value) => value.toUpperCase()))];
}

type RankingMetric = 'open_exceptions' | 'npl_ratio' | 'capital_adequacy' | 'deposits';

function extractRankingMetric(normalized: string): RankingMetric {
  if (/\b(exception|exceptions|alert|alerts|signal|signals)\b/.test(normalized)) {
    return 'open_exceptions';
  }
  if (/\bnpl\b/.test(normalized)) return 'npl_ratio';
  if (/\b(capital|car)\b/.test(normalized)) return 'capital_adequacy';
  if (/\bdeposits?\b/.test(normalized)) return 'deposits';
  return 'open_exceptions';
}

function extractRankingOrder(normalized: string): 'asc' | 'desc' {
  return /\b(lowest|bottom|smallest|fewest|asc|ascending)\b/.test(normalized) ? 'asc' : 'desc';
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
  inferred?: Record<string, string>,
): AssistantPlan {
  return {
    tool,
    arguments: args,
    purpose,
    source,
    confirmation: 'Run this read-only query on the synthetic training dataset?',
    ...(inferred && Object.keys(inferred).length > 0 ? { inferred } : {}),
  };
}

function planExceptions(
  normalized: string,
  institutionId: string | undefined,
  period: string | undefined,
): AssistantPlan {
  const severity = ['critical', 'high', 'medium', 'low'].find((value) =>
    new RegExp(`\\b${value}\\b`).test(normalized),
  );
  const status = ['open', 'under_review', 'resolved'].find((value) =>
    normalized.includes(value.replace('_', ' ')) || normalized.includes(value),
  );
  const inferred: Record<string, string> = {};
  if (!period) inferred.period = 'latest available period';
  if (!status) inferred.status = 'open';
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
    inferred,
  );
}

export function planAssistantQuestion(question: string): AssistantPlan {
  const normalized = question.trim().toLowerCase();
  if (normalized.length < 2 || normalized.length > 200) {
    throw new RequestValidationError('Enter a question between 2 and 200 characters.');
  }

  const period = extractPeriod(normalized);
  const institutionId = extractInstitutionId(question);
  const institutionIds = extractAllInstitutionIds(question);

  const hasExceptionTerm = /\b(exception|exceptions|alert|alerts|signal|signals)\b/.test(normalized);
  const hasInstitutionTerm = /\b(institution|institutions|bank|banks)\b/.test(normalized);
  const hasRankingTerm = /\b(rank|ranking|ranked|top|bottom|highest|lowest|best|worst|most|least)\b/.test(normalized);
  const hasBreakdownTerm = /\b(breakdown|break down|distribution|how many|by severity|by status)\b/.test(normalized);
  const hasTrendTerm = /\b(increase|increases|increased|increasing|decrease|decreases|decreased|decreasing|grew|grow|growing|growth|fell|fall|falling|trend|trends|change|changes|changed|over time)\b/.test(normalized) ||
    /\blast\s+\d+\s+periods?\b/.test(normalized);
  const hasExceptionRanking = !/\b(top|bottom)\s+\d+\b/.test(normalized) && (
    /\b(most|fewest|highest|lowest)\b[^.]*\b(open\s+)?(exceptions|alerts|signals)\b/.test(normalized) ||
    /\b(open\s+)?(exceptions|alerts|signals)\b[^.]*\b(most|fewest|highest|lowest)\b/.test(normalized) ||
    /\b(most|fewest|highest|lowest)\b[^.]*\bnumber of\b[^.]*\b(exceptions|alerts|signals)\b/.test(normalized)
  );
  const hasCorpusTerm = /\b(documents?|uploaded|circulars?|guidelines?|corpus|polic(?:y|ies))\b/.test(normalized) ||
    /\b(summarise|summarize)\b[^.]*\b(document|circular|guideline|upload)\b/.test(normalized);

  if (
    /\b(compare|comparing|compared|versus|vs)\b/.test(normalized) &&
    institutionIds.length >= 2
  ) {
    if (institutionIds.length > 5) {
      throw new RequestValidationError('Compare between 2 and 5 institutions.');
    }
    return plan(
      'compare_institutions',
      { institutionIds },
      `Compare the latest synthetic positions of ${institutionIds.join(', ')}.`,
      'Persisted synthetic institution and report records.',
    );
  }

  if (hasExceptionRanking) {
    const order = extractRankingOrder(normalized);
    return plan(
      'rank_institutions',
      { metric: 'open_exceptions', order },
      `Rank synthetic institutions by open exceptions in ${order === 'asc' ? 'ascending' : 'descending'} order.`,
      'Persisted synthetic institution register and open review-signal counts.',
    );
  }

  if (hasCorpusTerm) {
    return plan(
      'search_corpus',
      {
        query: question.trim(),
        ...(period ? { period } : {}),
        ...(institutionId ? { institutionId } : {}),
        limit: 6,
      },
      'Retrieve relevant synthetic documents, circulars or guidance and prepare a cited answer.',
      'Hybrid local retrieval over persisted synthetic documents and reports.',
    );
  }

  if (
    institutionId &&
    /\b(?:average|avg|mean|sum|total|change|difference|highest|max|maximum|lowest|min|minimum|latest|most recent|current|from|through|between)\b/.test(normalized) &&
    /\b(?:capital|captical|car|npl|liquidity|completeness|deposits?|loans?|report|history)\b/.test(normalized)
  ) {
    return plan(
      'get_institution',
      { institutionId },
      `Inspect the full synthetic reporting history for ${institutionId} and calculate the requested result.`,
      'Persisted synthetic institution reports and linked review signals.',
    );
  }

  if (hasBreakdownTerm) {
    if (hasExceptionTerm) {
      return planExceptions(normalized, institutionId, period);
    }
    return plan(
      'get_portfolio_overview',
      period ? { period } : {},
      'Summarize portfolio totals and reporting completeness for one period.',
      'Persisted synthetic reports and training review signals.',
      period ? undefined : { period: 'latest available period' },
    );
  }

  if (hasRankingTerm && (hasInstitutionTerm || !hasExceptionTerm)) {
    const metric = extractRankingMetric(normalized);
    const order = extractRankingOrder(normalized);
    return plan(
      'rank_institutions',
      { metric, order },
      `Rank synthetic institutions by ${metric} in ${order === 'asc' ? 'ascending' : 'descending'} order.`,
      'Persisted synthetic institution register and latest reported indicators.',
    );
  }

  if (hasExceptionTerm) {
    return planExceptions(normalized, institutionId, period);
  }

  if (hasTrendTerm) {
    const indicatorId = extractIndicatorId(normalized);
    return plan(
      'get_analytics',
      {
        ...(period ? { period } : {}),
        ...(institutionId ? { institutionId } : {}),
        ...(indicatorId ? { indicatorId } : {}),
      },
      indicatorId
        ? `Review the ${indicatorId} trend with its period-to-period change.`
        : 'Review synthetic indicator trends and period-to-period changes.',
      'Persisted synthetic supervisory indicators and source reports.',
      period ? undefined : { period: 'latest available period' },
    );
  }

  if (institutionIds.length >= 2 && institutionIds.length <= 5) {
    return plan(
      'compare_institutions',
      { institutionIds },
      `Compare the latest synthetic positions of ${institutionIds.join(', ')}.`,
      'Persisted synthetic institution and report records.',
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
      period ? undefined : { period: 'latest available period' },
    );
  }

  if (/\b(analytics|indicator|ratio|npl|capital|liquidity|completeness|deposits?|loans?)\b/.test(normalized)) {
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
      period ? undefined : { period: 'latest available period' },
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

  if (institutionId) {
    return plan(
      'get_institution',
      { institutionId },
      `Inspect the synthetic institution ${institutionId}, its reports and review signals.`,
      'Persisted synthetic institution and report records.',
    );
  }

  return plan(
    'search_corpus',
    {
      query: question.trim(),
      ...(period ? { period } : {}),
      ...(institutionId ? { institutionId } : {}),
      limit: 6,
    },
    'Retrieve relevant synthetic evidence and prepare a cited answer using the local model.',
    'Hybrid local retrieval over persisted synthetic documents, reports, institutions and review signals.',
  );
}

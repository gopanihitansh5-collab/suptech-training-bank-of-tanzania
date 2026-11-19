import { INDICATOR_DEFINITIONS } from './catalog';
import { getAnalytics, getOverview, listExceptions, listInstitutions } from './repository';

export interface AssistantSuggestionSet {
  generatedAt: string;
  suggestions: string[];
  completions: Array<{
    type: 'institution' | 'indicator' | 'period' | 'question';
    value: string;
    label: string;
  }>;
}

type CompletionType = AssistantSuggestionSet['completions'][number]['type'];
type Completion = AssistantSuggestionSet['completions'][number];

const GENERIC_SUGGESTIONS = [
  'Summarize the portfolio overview',
  'List synthetic institutions',
  'Show critical open exceptions',
  'Rank institutions by capital adequacy',
];

function compact<T>(values: Array<T | null | undefined>): T[] {
  return values.filter((value): value is T => value !== null && value !== undefined);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function indicatorLabel(
  id: string | null | undefined,
  indicators: Array<{ id: string; label: string }>,
): string {
  if (id) {
    const match = indicators.find((indicator) => indicator.id === id);
    if (match) return match.label;
    return id.replaceAll('_', ' ');
  }
  return indicators[0]?.label ?? INDICATOR_DEFINITIONS[0].label;
}

function completion(
  type: CompletionType,
  value: string,
  label: string,
): Completion {
  return { type, value, label };
}

function balancedCompletions(groups: Completion[][]): Completion[] {
  const balanced: Completion[] = [];
  for (let index = 0; index < 3; index += 1) {
    for (const group of groups) {
      const item = group[index];
      if (item) balanced.push(item);
    }
  }
  return balanced.slice(0, 12);
}

export async function buildAssistantSuggestions(query?: string): Promise<AssistantSuggestionSet> {
  const generatedAt = new Date().toISOString();
  try {
    const [overview, institutions, exceptions, analytics] = await Promise.all([
      getOverview(),
      listInstitutions({ pageSize: 50 }),
      listExceptions({ status: 'open', pageSize: 5 }),
      getAnalytics(),
    ]);

    const period =
      overview.period ??
      analytics.period ??
      institutions.items.find((institution) => institution.latestPeriod)?.latestPeriod ??
      null;

    const indicators = analytics.indicators.length > 0
      ? analytics.indicators.map((indicator) => ({ id: indicator.id, label: indicator.label }))
      : INDICATOR_DEFINITIONS.map((indicator) => ({ id: indicator.id, label: indicator.label }));

    const institutionItems = institutions.items;
    const exceptionItems = exceptions.items;
    const topException = exceptionItems[0];
    const firstInstitution = institutionItems[0];
    const secondInstitution = institutionItems[1];
    const primaryIndicator = indicatorLabel(
      topException?.indicatorId ?? analytics.indicators[0]?.id,
      indicators,
    );
    const secondaryIndicator = indicators[1]?.label ?? 'liquidity';

    const questions: string[] = [];
    const add = (value: string): void => {
      const trimmed = value.trim();
      if (trimmed && !questions.includes(trimmed)) questions.push(trimmed);
    };

    add(period ? `Summarize the portfolio for ${period}` : 'Summarize the portfolio overview');
    add('Which institutions have the most open exceptions?');
    if (firstInstitution && secondInstitution) {
      add(`Compare deposits for ${firstInstitution.institutionId} and ${secondInstitution.institutionId}`);
    } else {
      add('Compare institutions by deposits');
    }
    add(period ? `Show the NPL ratio trend for ${period}` : 'Show the NPL ratio trend');
    if (topException) {
      add(`Explain why ${topException.institutionName} was flagged for ${primaryIndicator}`);
    } else if (firstInstitution) {
      add(`Explain why ${firstInstitution.name} was flagged for ${primaryIndicator}`);
    }
    add(period ? `List critical open exceptions for ${period}` : 'List critical open exceptions');
    add('Rank institutions by capital adequacy');
    add(`Find documents about ${primaryIndicator}`);
    add(`Find documents about ${secondaryIndicator}`);
    if (exceptions.total > 0) {
      add(period
        ? `Review the ${exceptions.total} open exceptions for ${period}`
        : `Review the ${exceptions.total} open exceptions`);
    }
    if (firstInstitution) {
      add(`Show the deposits trend for ${firstInstitution.institutionId}`);
    }
    add('Which institutions have the fewest open exceptions?');

    const institutionCompletions = institutionItems.map((institution) =>
      completion(
        'institution',
        institution.institutionId,
        `${institution.name} (${institution.institutionId})`,
      ),
    );
    const indicatorCompletions = indicators.map((indicator) =>
      completion('indicator', indicator.label, `${indicator.label} (${indicator.id})`),
    );
    const periodValues = unique(compact([
      ...overview.trend.map((row) => row.period),
      ...analytics.trend.map((row) => row.period),
      ...institutionItems.map((institution) => institution.latestPeriod),
      ...exceptionItems.map((item) => item.period),
    ])).sort((left, right) => right.localeCompare(left));
    const periodCompletions = periodValues.slice(0, 6).map((value) =>
      completion('period', value, value),
    );
    const questionCompletions = questions.map((value) =>
      completion('question', value, value),
    );

    const allCompletions = [
      ...institutionCompletions,
      ...indicatorCompletions,
      ...periodCompletions,
      ...questionCompletions,
    ];

    const trimmedQuery = query?.trim().toLowerCase() ?? '';
    const completions = trimmedQuery
      ? allCompletions
        .filter((entry) =>
          entry.value.toLowerCase().includes(trimmedQuery) ||
          entry.label.toLowerCase().includes(trimmedQuery),
        )
        .slice(0, 8)
      : balancedCompletions([
        institutionCompletions,
        indicatorCompletions,
        periodCompletions,
        questionCompletions,
      ]);

    return {
      generatedAt,
      suggestions: questions,
      completions,
    };
  } catch {
    return {
      generatedAt,
      suggestions: GENERIC_SUGGESTIONS,
      completions: [],
    };
  }
}

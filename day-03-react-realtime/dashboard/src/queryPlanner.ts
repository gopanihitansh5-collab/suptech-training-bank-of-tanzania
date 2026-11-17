import { api } from './api';

export type QueryAction =
  | 'summary'
  | 'exceptions'
  | 'exception_ranking'
  | 'indicators'
  | 'institutions'
  | 'institution_detail';

export interface QueryPlan {
  action: QueryAction;
  description: string;
  endpoint: string;
  filters: {
    reporting_period?: string;
    institution_id?: string;
  };
}

const PERIOD_PATTERN = /\b(\d{4}-\d{2})\b/;
const INSTITUTION_PATTERN = /\b(TZ\d{3})\b/i;

/** Build a mock-first, read-only plan from the supported API operations. */
export function planQuery(question: string): QueryPlan {
  const normalized = question.trim().toLowerCase();
  if (!normalized) {
    throw new Error('Enter a question before planning a query.');
  }

  const period = question.match(PERIOD_PATTERN)?.[1];
  if (period) {
    const month = Number(period.slice(-2));
    if (month < 1 || month > 12) {
      throw new Error('Reporting periods must use a real month in YYYY-MM format.');
    }
  }

  const institutionId = question.match(INSTITUTION_PATTERN)?.[1]?.toUpperCase();
  const filters = {
    ...(period ? { reporting_period: period } : {}),
    ...(institutionId ? { institution_id: institutionId } : {}),
  };

  if (
    /exception|breach/.test(normalized) &&
    /highest|most|top|rank/.test(normalized) &&
    /institution|bank/.test(normalized)
  ) {
    return {
      action: 'exception_ranking',
      description:
        'Count approved exception records by institution and rank them from highest to lowest.',
      endpoint: '/api/v1/exceptions',
      filters,
    };
  }

  if (/exception|breach|threshold|flag/.test(normalized)) {
    return {
      action: 'exceptions',
      description: 'Read supervisory exceptions matching the selected filters.',
      endpoint: '/api/v1/exceptions',
      filters,
    };
  }

  if (/indicator|ratio|deposit|loan|coverage/.test(normalized)) {
    return {
      action: 'indicators',
      description: 'Read supervisory indicators matching the selected filters.',
      endpoint: '/api/v1/indicators',
      filters,
    };
  }

  if (/institution|register|bank/.test(normalized)) {
    if (institutionId) {
      return {
        action: 'institution_detail',
        description: `Read the register and indicator details for ${institutionId}.`,
        endpoint: `/api/v1/institutions/${institutionId}`,
        filters,
      };
    }
    return {
      action: 'institutions',
      description: 'Read the supervised institution register.',
      endpoint: '/api/v1/institutions',
      filters: {},
    };
  }

  return {
    action: 'summary',
    description: 'Read sector summary data matching the selected period.',
    endpoint: '/api/v1/summary',
    filters: period ? { reporting_period: period } : {},
  };
}

/** Execute only the typed read operations represented by a planned action. */
export function executeQueryPlan(plan: QueryPlan): Promise<unknown> {
  switch (plan.action) {
    case 'summary':
      return api.summary(plan.filters.reporting_period);
    case 'exceptions':
      return api.exceptions(plan.filters);
    case 'exception_ranking':
      return api.exceptions(plan.filters);
    case 'indicators':
      return api.indicators(plan.filters);
    case 'institutions':
      return api.institutions();
    case 'institution_detail':
      if (!plan.filters.institution_id) {
        throw new Error('An institution identifier is required for this query.');
      }
      return api.institution(plan.filters.institution_id);
  }
}

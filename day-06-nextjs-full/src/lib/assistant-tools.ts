import { RequestValidationError } from './api-errors';
import { INDICATOR_DEFINITIONS } from './catalog';
import {
  getAnalytics,
  getInstitutionDetail,
  getOverview,
  listExceptions,
  listInstitutions,
} from './repository';
import { answerFromEvidence } from './grounded-answer';
import { searchGroundedEvidence } from './grounded-retrieval';

export type ToolName =
  | 'get_portfolio_overview'
  | 'list_exceptions'
  | 'get_institution'
  | 'get_analytics'
  | 'list_institutions'
  | 'search_corpus';

export interface ToolParameterDescriptor {
  type: 'string' | 'integer';
  description: string;
  enum?: readonly string[];
}

export interface ToolDescriptor {
  name: ToolName;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameterDescriptor>;
    required?: readonly string[];
    additionalProperties: false;
  };
}

export interface ToolResult {
  tool: ToolName;
  arguments: Record<string, unknown>;
  result: unknown;
  summary: string;
}

export const ASSISTANT_TOOLS: readonly ToolDescriptor[] = [
  {
    name: 'get_portfolio_overview',
    description: 'Portfolio-wide synthetic totals, reporting completeness and review-signal counts.',
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', description: 'Reporting period in YYYY-MM format.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'list_exceptions',
    description: 'Synthetic supervisory exceptions filtered by status, severity, institution and period.',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Exception workflow status.',
          enum: ['open', 'under_review', 'resolved'],
        },
        severity: {
          type: 'string',
          description: 'Training review-signal severity.',
          enum: ['critical', 'high', 'medium', 'low'],
        },
        institutionId: { type: 'string', description: 'Institution identifier such as TZ001.' },
        period: { type: 'string', description: 'Reporting period in YYYY-MM format.' },
        limit: { type: 'integer', description: 'Maximum rows to return, 1 to 25.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_institution',
    description: 'One synthetic institution with its latest position, reports and exceptions.',
    parameters: {
      type: 'object',
      properties: {
        institutionId: { type: 'string', description: 'Institution identifier such as TZ001.' },
      },
      required: ['institutionId'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_analytics',
    description: 'Synthetic indicator values and trend from the analytics catalog.',
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', description: 'Reporting period in YYYY-MM format.' },
        institutionId: { type: 'string', description: 'Optional institution identifier for context.' },
        indicatorId: { type: 'string', description: 'Allowlisted indicator identifier.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'list_institutions',
    description: 'Search synthetic institutions by identifier or name.',
    parameters: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Identifier or name fragment.' },
        limit: { type: 'integer', description: 'Maximum rows to return, 1 to 25.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'search_corpus',
    description: 'Hybrid retrieval over synthetic documents, reports, institutions and review signals, followed by a cited local-model answer.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural-language query over synthetic evidence.' },
        period: { type: 'string', description: 'Optional reporting period in YYYY-MM format.' },
        institutionId: { type: 'string', description: 'Optional institution identifier.' },
        limit: { type: 'integer', description: 'Maximum evidence sources, 1 to 25.' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
];

export const TOOL_NAMES: readonly ToolName[] = ASSISTANT_TOOLS.map((tool) => tool.name);

const NUMBER_FORMAT = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });
const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;
const STATUSES = ['open', 'under_review', 'resolved'] as const;
const INDICATOR_IDS = new Set(INDICATOR_DEFINITIONS.map((definition) => definition.id));

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'not available';
  return NUMBER_FORMAT.format(value);
}

function isToolName(value: string): value is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(value);
}

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new RequestValidationError('Tool arguments must be an object.');
  }
  return value as Record<string, unknown>;
}

function readString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new RequestValidationError(`${key} must be a string.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > 200) {
    throw new RequestValidationError(`${key} must not exceed 200 characters.`);
  }
  return trimmed === '' ? undefined : trimmed;
}

function readPeriod(args: Record<string, unknown>): string | undefined {
  const value = readString(args, 'period');
  if (!value) return undefined;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw new RequestValidationError('period must use YYYY-MM format.');
  }
  return value;
}

function readLimit(args: Record<string, unknown>, fallback = 5): number {
  const value = args.limit;
  if (value === undefined || value === null) return fallback;
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 25) {
    throw new RequestValidationError('limit must be an integer between 1 and 25.');
  }
  return parsed;
}

function readInstitutionId(args: Record<string, unknown>): string | undefined {
  const value = readString(args, 'institutionId');
  if (!value) return undefined;
  if (!/^[A-Z0-9-]{2,24}$/i.test(value)) {
    throw new RequestValidationError('institutionId has an invalid format.');
  }
  return value.toUpperCase();
}

function readSeverity(args: Record<string, unknown>): string | undefined {
  const value = readString(args, 'severity');
  if (!value) return undefined;
  const severity = value.toLowerCase();
  if (!(SEVERITIES as readonly string[]).includes(severity)) {
    throw new RequestValidationError('severity must be critical, high, medium or low.');
  }
  return severity;
}

function readStatus(args: Record<string, unknown>): string | undefined {
  const value = readString(args, 'status');
  if (!value) return undefined;
  const status = value.toLowerCase();
  if (!(STATUSES as readonly string[]).includes(status)) {
    throw new RequestValidationError('status must be open, under_review or resolved.');
  }
  return status;
}

function readIndicatorId(args: Record<string, unknown>): string | undefined {
  const value = readString(args, 'indicatorId');
  if (!value) return undefined;
  if (!INDICATOR_IDS.has(value)) {
    throw new RequestValidationError('indicatorId is not in the training catalog.');
  }
  return value;
}

function defined(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  );
}

export async function runTool(name: string, rawArguments: unknown): Promise<ToolResult> {
  if (!isToolName(name)) {
    throw new RequestValidationError('Unknown assistant tool.');
  }
  const args = asObject(rawArguments);
  const descriptor = ASSISTANT_TOOLS.find((tool) => tool.name === name);
  if (!descriptor) {
    throw new RequestValidationError('Unknown assistant tool.');
  }
  const allowedArguments = new Set(Object.keys(descriptor.parameters.properties));
  if (Object.keys(args).some((key) => !allowedArguments.has(key))) {
    throw new RequestValidationError('Tool arguments include an unsupported field.');
  }
  if (descriptor.parameters.required?.some((key) => args[key] === undefined)) {
    throw new RequestValidationError('A required tool argument is missing.');
  }

  switch (name) {
    case 'get_portfolio_overview': {
      const period = readPeriod(args);
      const argumentsUsed = defined({ period });
      const result = await getOverview(period);
      const summary = result.period
        ? `Portfolio ${result.period}: ${result.summary.institutions} institutions, ${result.summary.reportsReceived} of ${result.summary.reportsExpected} reports received, ${result.summary.openExceptions} open exceptions (${result.summary.criticalExceptions} critical), deposits ${formatNumber(result.summary.depositsTzsBillions)} TZS bn and loans ${formatNumber(result.summary.loansTzsBillions)} TZS bn.`
        : 'No synthetic reporting periods are available.';
      return { tool: name, arguments: argumentsUsed, result, summary };
    }
    case 'list_exceptions': {
      const status = readStatus(args);
      const severity = readSeverity(args);
      const institutionId = readInstitutionId(args);
      const period = readPeriod(args);
      const limit = readLimit(args);
      const argumentsUsed = defined({ status, severity, institutionId, period, limit });
      const result = await listExceptions({ status, severity, institutionId, period, pageSize: limit });
      const first = result.items[0];
      const summary = first
        ? `${result.total} synthetic exceptions matched; highest priority is ${first.severity} ${first.indicatorId} for ${first.institutionName} in ${first.period} (observed ${formatNumber(first.observedValue)} against threshold ${formatNumber(first.thresholdValue)}).`
        : 'No synthetic exceptions matched the requested filters.';
      return { tool: name, arguments: argumentsUsed, result, summary };
    }
    case 'get_institution': {
      const institutionId = readInstitutionId(args);
      if (!institutionId) {
        throw new RequestValidationError('institutionId is required.');
      }
      const argumentsUsed = { institutionId };
      const result = await getInstitutionDetail(institutionId);
      const institution = result.institution;
      const summary = `${institution.name} (${institution.institutionId}) is a ${institution.type} in ${institution.region} with ${institution.status} status; latest period ${institution.latestPeriod ?? 'not available'}, deposits ${formatNumber(institution.depositsTzsBillions)} TZS bn, capital adequacy ${formatNumber(institution.capitalAdequacyRatioPercent)}%, NPL ${formatNumber(institution.nplRatioPercent)}%, ${institution.openExceptions} open exceptions.`;
      return { tool: name, arguments: argumentsUsed, result, summary };
    }
    case 'get_analytics': {
      const period = readPeriod(args);
      const institutionId = readInstitutionId(args);
      const indicatorId = readIndicatorId(args);
      const argumentsUsed = defined({ period, institutionId, indicatorId });
      const analytics = await getAnalytics(period, indicatorId);
      const result = institutionId
        ? { ...analytics, institution: (await getInstitutionDetail(institutionId)).institution }
        : analytics;
      const summary = analytics.period
        ? `Analytics ${analytics.period}: ${analytics.indicators.length} indicators across ${analytics.trend.length} periods${institutionId ? ` for ${institutionId}` : ''}.`
        : 'No synthetic analytics periods are available.';
      return { tool: name, arguments: argumentsUsed, result, summary };
    }
    case 'list_institutions': {
      const search = readString(args, 'search');
      const limit = readLimit(args);
      const argumentsUsed = defined({ search, limit });
      const result = await listInstitutions({ search, pageSize: limit });
      const first = result.items[0];
      const summary = first
        ? `${result.total} synthetic institutions matched; first is ${first.name} (${first.institutionId}) in ${first.region} with ${first.openExceptions} open exceptions.`
        : 'No synthetic institutions matched the requested search.';
      return { tool: name, arguments: argumentsUsed, result, summary };
    }
    case 'search_corpus': {
      const search = readString(args, 'query');
      if (!search || search.length < 2) {
        throw new RequestValidationError('query must contain at least 2 characters.');
      }
      const period = readPeriod(args);
      const institutionId = readInstitutionId(args);
      const limit = readLimit(args, 6);
      const argumentsUsed = defined({ query: search, period, institutionId, limit });
      const evidence = await searchGroundedEvidence(search, {
        period,
        institutionId,
        limit,
      });
      const answer = await answerFromEvidence(search, evidence.hits);
      const result = {
        retrievalMode: evidence.mode,
        ...(evidence.fallbackReason ? { fallbackReason: evidence.fallbackReason } : {}),
        hits: evidence.hits,
        answer,
      };
      return {
        tool: name,
        arguments: argumentsUsed,
        result,
        summary: answer.status === 'answered'
          ? `Retrieved ${evidence.hits.length} synthetic evidence source(s) with ${evidence.mode} retrieval and generated a cited local-model answer.`
          : `Retrieved ${evidence.hits.length} synthetic evidence source(s) with ${evidence.mode} retrieval; ${answer.text}`,
      };
    }
    default:
      throw new RequestValidationError('Unknown assistant tool.');
  }
}

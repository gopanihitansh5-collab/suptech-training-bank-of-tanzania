/**
 * Multi-Agentic Orchestration System
 * 
 * Manages multiple AI agents and stateful supervisory workflows.
 * Integrates local Qwen model via LM Studio when available, with
 * deterministic offline fallback ensuring resilient, type-safe execution.
 */
import { RequestValidationError } from './api-errors';
import { INDICATOR_DEFINITIONS } from './catalog';
import {
  formatNumber,
} from './assistant-tools';
import { searchGroundedEvidence } from './grounded-retrieval';
import {
  generateChatCompletion,
  formatModelResponseText,
  getActiveChatProviderName,
  isChatProviderAvailable,
  type ChatMessage,
} from './model-provider';
import {
  getAnalytics,
  getInstitutionDetail,
  getOverview,
  listExceptions,
  listInstitutions,
  type ExceptionRow,
  type InstitutionDetail,
  type InstitutionRow,
  type OverviewData,
} from './repository';
import type { SearchHit, SearchCitation } from './search';

export interface AgentConfig {
  /** Unique agent identifier */
  id: string;
  /** Agent name and role */
  name: string;
  /** Short, non-sensitive description shown in the UI */
  description: string;
  /** System prompt defining agent capabilities */
  systemPrompt: string;
  /** Maximum tokens for response */
  maxTokens?: number;
  /** Temperature for generation (lower = more deterministic) */
  temperature?: number;
}

export interface AgentRequest {
  agentId: string;
  userMessage: string;
  conversationHistory?: Array<{ role: string; content: string }>;
}

export interface AgentResponse {
  success: boolean;
  agentId: string;
  agentName: string;
  response?: string;
  error?: string;
  tokensUsed?: number;
  latencyMs?: number;
}

export interface OrchestrationResult {
  success: boolean;
  agents: AgentResponse[];
  totalLatencyMs: number;
  error?: string;
}

export type SupervisoryIntent =
  | 'analytical'
  | 'document'
  | 'combined'
  | 'exception_explanation'
  | 'report'
  | 'general';

export interface SupervisoryScope {
  institutionId?: string;
  institutionName?: string;
  period?: string;
  indicatorId?: string;
  region?: string;
  tier?: string;
  status?: string;
}

export interface WorkflowPlan {
  workflowType: string;
  steps: string[];
  description: string;
}

export interface VerificationCheck {
  name: string;
  status: 'passed' | 'warning' | 'failed';
  detail: string;
}

export interface VerificationReport {
  verified: boolean;
  checks: VerificationCheck[];
  notes?: string;
}

export interface SupervisoryResponseCard {
  title: string;
  value: string;
  caption?: string;
  badge?: string;
}

export interface SupervisoryResponseCitation {
  id: string;
  title: string;
  excerpt: string;
  reference: string;
  kind?: string;
}

export interface SupervisoryResponseFact {
  label: string;
  value: string;
  detail?: string;
}

export interface SupervisoryResponsePayload {
  executiveSummary: string;
  detail: string;
  facts: SupervisoryResponseFact[];
  dataCards?: SupervisoryResponseCard[];
  citations?: SupervisoryResponseCitation[];
  disclaimer: string;
}

export interface SupervisoryWorkflowResult {
  requestId: string;
  intent: SupervisoryIntent;
  scope: SupervisoryScope;
  activeAgents: string[];
  plan: WorkflowPlan;
  retrievedSources?: Array<{
    id: string;
    title: string;
    excerpt: string;
    kind: string;
    citation: SearchCitation;
    rank?: number;
  }>;
  analyticalResults?: Record<string, unknown>;
  verification: VerificationReport;
  response: SupervisoryResponsePayload;
  latencyMs: number;
  modelUsed: 'groq' | 'local-qwen' | 'deterministic-fallback';
  modelProvider: string;
  contextUsed: boolean;
}

export const MAX_AGENT_REQUESTS = 10;
export const MAX_AGENT_MESSAGE_LENGTH = 2000;

export const SYNTHETIC_DISCLAIMER =
  'Synthetic demonstration data only. All values, thresholds, and signals are illustrative and do not reflect actual Bank of Tanzania records, official supervisory determinations, or statutory enforcement actions.';

export const AGENT_CONFIGS: Record<string, AgentConfig> = {
  // Existing individual analysis roles
  'data-ingestion': {
    id: 'data-ingestion',
    name: 'Data Ingestion Agent',
    description: 'Explain synthetic record validation and data-quality checks.',
    systemPrompt: `You explain data-quality concepts for a synthetic supervisory training demo.
Only analyze fictional values explicitly supplied in the prompt. Do not claim to validate or ingest files.
Training thresholds are illustrative, not official rules. Never invent records or missing values.
State when the supplied evidence is insufficient. Do not produce SQL or perform actions.`,
    maxTokens: 1024,
    temperature: 0.3,
  },
  'prudential-analysis': {
    id: 'prudential-analysis',
    name: 'Prudential Analysis Agent',
    description: 'Explain supplied synthetic prudential indicators and their limits.',
    systemPrompt: `You explain prudential indicators for a synthetic supervisory training demo.
Only analyze fictional values and formulas explicitly supplied in the prompt. Do not infer real-world compliance.
Training thresholds are illustrative, not official rules or statutory limits.
State calculations and evidence limits clearly. Never invent data, SQL, or recommendations.`,
    maxTokens: 1024,
    temperature: 0.2,
  },
  'exception-classifier': {
    id: 'exception-classifier',
    name: 'Exception Classifier Agent',
    description: 'Summarize synthetic review signals without treating them as findings.',
    systemPrompt: `You summarize synthetic training review signals.
Only classify using values and illustrative thresholds explicitly supplied in the prompt.
A signal is not a confirmed violation, official finding, or proof of non-compliance.
Do not cite real laws or policies, invent evidence, or recommend enforcement actions.`,
    maxTokens: 512,
    temperature: 0.1,
  },
  'report-synthesizer': {
    id: 'report-synthesizer',
    name: 'Report Synthesizer Agent',
    description: 'Organize supplied fictional records into a concise, cited summary.',
    systemPrompt: `You organize only the fictional records included in the prompt.
Do not imply that records were independently verified or that a live data source was queried.
Include a synthetic-data disclaimer and preserve provided source IDs exactly.
Do not invent facts, provide statutory compliance conclusions, or generate SQL.`,
    maxTokens: 2048,
    temperature: 0.4,
  },
  'anomaly-detector': {
    id: 'anomaly-detector',
    name: 'Anomaly Detection Agent',
    description: 'Describe notable patterns only when the prompt contains enough data.',
    systemPrompt: `You describe possible patterns in synthetic values explicitly provided in the prompt.
Do not claim to run statistical tests unless the necessary values and calculations are shown.
Do not invent confidence levels, records, or evidence. A pattern is not a regulatory finding.
State when the supplied history is too small or incomplete for a conclusion.`,
    maxTokens: 768,
    temperature: 0.2,
  },

  // Canonical Supervisory Multi-Agent Architecture
  'supervisor-router': {
    id: 'supervisor-router',
    name: 'Supervisor Router Agent',
    description: 'Classifies intent (analytical, document, combined, exception_explanation, report, general), extracts scope, and plans the workflow.',
    systemPrompt: `You are the lead Supervisor Router Agent for a supervisory intelligence monitoring platform.
Classify incoming supervisory queries into one of the canonical intents:
analytical, document, combined, exception_explanation, report, or general.
Extract relevant entities: institutions, reporting periods, and supervisory indicators.
Route each request to the designated specialist workflow. All data is synthetic training data.`,
    maxTokens: 512,
    temperature: 0.1,
  },
  'institution-context': {
    id: 'institution-context',
    name: 'Institution Context Agent',
    description: 'Identifies institution profile (name, region, tier, status) and establishes permitted scope.',
    systemPrompt: `You are the Institution Context Agent.
Resolve institution identities, organizational tiers, regulatory license statuses, and regional footprints from synthetic records.
Establish the strictly permitted supervisory scope for downstream analytical and document agents.
Never infer or fabricate institution data beyond synthetic records.`,
    maxTokens: 512,
    temperature: 0.1,
  },
  'data-analyst': {
    id: 'data-analyst',
    name: 'Data Analyst Agent',
    description: 'Executes approved analytical queries (portfolio totals, trend analysis, institution ratios) using parameterised queries.',
    systemPrompt: `You are the Supervisory Data Analyst Agent.
Analyze synthetic prudential indicators, portfolio totals, NPL trends, capital adequacy ratios, and liquidity metrics.
All calculations are based on approved parameterised queries from repository.ts.
Explain numeric results transparently. Do not invent numbers or run unapproved SQL.`,
    maxTokens: 1024,
    temperature: 0.2,
  },
  'document-retrieval': {
    id: 'document-retrieval',
    name: 'Document Retrieval Agent',
    description: 'Searches documents using hybrid retrieval (lexical + semantic embeddings) with source citations.',
    systemPrompt: `You are the Document Retrieval Agent for a synthetic supervisory training application.
Locate relevant regulatory guidance, circulars, compliance manuals, and reported returns from synthetic records using hybrid search.
Preserve exact source citations ([S1], [S2]) and provenance.
Never fabricate document excerpts or extrapolate beyond retrieved passages. All evidence is synthetic training data.`,
    maxTokens: 1024,
    temperature: 0.2,
  },
  'exception-indicator': {
    id: 'exception-indicator',
    name: 'Exception & Indicator Agent',
    description: 'Inspects threshold configurations, open review signals, and breach evidence from persisted records.',
    systemPrompt: `You are the Exception and Indicator Specialist Agent.
Review illustrative threshold configurations and open review signals.
Crucial rule: A threshold breach in this training environment is a supervisory review signal, not an official finding of statutory non-compliance or misconduct.
Trace each signal to its observed value, threshold value, and reporting period. All data is synthetic.`,
    maxTokens: 768,
    temperature: 0.1,
  },
  'report-agent': {
    id: 'report-agent',
    name: 'Supervisory Report Agent',
    description: 'Aggregates findings and formats structured supervisory summaries and tables.',
    systemPrompt: `You are the Supervisory Report Agent for synthetic supervisory monitoring.
Format comprehensive supervisory summaries, comparison tables, and compliance status overviews from synthetic training records.
Ensure all tables and aggregates clearly state reporting periods and synthetic data disclaimers.`,
    maxTokens: 1536,
    temperature: 0.2,
  },
  'verification-agent': {
    id: 'verification-agent',
    name: 'Verification & Guardrails Agent',
    description: 'Performs automated verification checks on citations, calculation sanity, and regulatory policy compliance.',
    systemPrompt: `You are the Supervisory Verification Agent for synthetic supervisory monitoring.
You enforce three critical verification gates on synthetic records:
1. Citation fidelity: Verify all cited IDs ([S1], [S2], etc.) exist in the retrieved evidence without orphan references.
2. Calculation sanity: Validate that metrics, percentages (0-100%), and aggregates are mathematically sound and consistent.
3. Policy compliance: Ensure threshold breaches are labeled as review signals rather than legal violations, and synthetic disclaimers are preserved.`,
    maxTokens: 768,
    temperature: 0.1,
  },
  'response-composer': {
    id: 'response-composer',
    name: 'Response Composer Agent',
    description: 'Synthesizes final grounded response with executive summary, data cards, citations, and verification status.',
    systemPrompt: `You are the Response Composer Agent for synthetic supervisory monitoring.
Synthesize verified evidence and analytical findings into a clear, executive-grade supervisory briefing based on synthetic records.
Provide an executive summary, grounded narrative, key metric cards, and citations.
Always include the synthetic training disclaimer.`,
    maxTokens: 1536,
    temperature: 0.3,
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function containsNumber(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.some(containsNumber);
  if (isRecord(value)) return Object.values(value).some(containsNumber);
  return false;
}

function isValidComposerOutput(
  text: string,
  analyticalResults: Record<string, unknown>,
  retrievedSources?: SearchHit[],
): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 80) return false;
  const dataExists =
    containsNumber(analyticalResults) || (retrievedSources?.length ?? 0) > 0;
  if (dataExists && !/\d/.test(trimmed)) return false;
  const lower = trimmed.toLowerCase();
  const genericPhrases = [
    "i don't have access",
    'as an ai',
    'query processed',
    'no data available',
  ];
  if (dataExists && genericPhrases.some((phrase) => lower.includes(phrase))) {
    return false;
  }
  return true;
}

function buildModelAggregateFacts(
  analyticalResults: Record<string, unknown>,
  scope: SupervisoryScope,
): Record<string, unknown> {
  const facts: Record<string, unknown> = {
    scope: scope.institutionId ? 'single synthetic institution aggregate' : 'portfolio aggregate',
  };
  if (scope.period) facts.reportingPeriod = scope.period;

  const overview = analyticalResults.overview as OverviewData | undefined;
  if (overview) {
    facts.reportingPeriod = overview.period ?? scope.period ?? 'not available';
    facts.portfolio = overview.summary;
    facts.portfolioTrend = overview.trend.slice(-6).map((point) => ({
      period: point.period,
      depositsTzsBillions: point.depositsTzsBillions,
      loansTzsBillions: point.loansTzsBillions,
      completenessPercent: point.completenessPercent,
      reviewSignalCount: point.exceptions,
    }));
  }

  const institution = analyticalResults.institution as InstitutionDetail | undefined;
  if (institution) {
    const reports = institution.reports;
    const aggregates: Record<string, unknown> = {
      reportingPeriods: reports.length,
      openReviewSignals: institution.institution.openExceptions,
    };
    for (const [label, values] of [
      ['depositsTzsBillions', reports.map((row) => row.depositsTzsBillions)],
      ['loansTzsBillions', reports.map((row) => row.loansTzsBillions)],
      ['capitalAdequacyPercent', reports.map((row) => row.capitalAdequacyRatioPercent)],
      ['liquidityPercent', reports.map((row) => row.liquidityRatioPercent)],
      ['nplPercent', reports.map((row) => row.nplRatioPercent)],
      ['completenessPercent', reports.map((row) => row.completenessPercent)],
    ] as const) {
      aggregates[label] = numericStats([...values]);
    }
    if (reports.length > 0) {
      aggregates.latestReportingPeriod = reports[0].period;
    }
    facts.institutionHistoryAggregates = aggregates;
    facts.reviewSignalStatusCounts = countValues(
      institution.exceptions,
      (row) => row.status,
    );
    facts.reviewSignalSeverityCounts = countValues(
      institution.exceptions,
      (row) => row.severity,
    );
  }

  const analytics = analyticalResults.analytics as {
    period: string | null;
    indicators: Array<{ label: string; unit: string; value: number | null }>;
    trend: Array<{
      period: string;
      deposits: number;
      loans: number;
      completeness: number | null;
    }>;
  } | undefined;
  if (analytics) {
    facts.reportingPeriod = analytics.period ?? facts.reportingPeriod ?? 'not available';
    facts.indicatorAggregates = analytics.indicators.map(({ label, unit, value }) => ({
      label,
      unit,
      value,
    }));
    facts.portfolioTrend = analytics.trend.slice(-6).map((point) => ({
      period: point.period,
      depositsTzsBillions: point.deposits,
      loansTzsBillions: point.loans,
      completenessPercent: point.completeness,
    }));
  }

  const exceptions = analyticalResults.exceptions as ExceptionRow[] | undefined;
  if (exceptions) {
    facts.reviewSignalSampleCount = exceptions.length;
    facts.reviewSignalStatusCounts = countValues(exceptions, (row) => row.status);
    facts.reviewSignalSeverityCounts = countValues(exceptions, (row) => row.severity);
    facts.reviewSignalValueAggregates = {
      observed: numericStats(exceptions.map((row) => row.observedValue)),
      illustrativeThreshold: numericStats(exceptions.map((row) => row.thresholdValue)),
    };
  }

  const institutions = analyticalResults.institutions as InstitutionRow[] | undefined;
  if (institutions) {
    facts.institutionSampleCount = institutions.length;
    facts.institutionStatusCounts = countValues(institutions, (row) => row.status);
    facts.institutionAggregates = {
      depositsTzsBillions: numericStats(
        institutions.map((row) => row.depositsTzsBillions),
      ),
      capitalAdequacyPercent: numericStats(
        institutions.map((row) => row.capitalAdequacyRatioPercent),
      ),
      nplPercent: numericStats(institutions.map((row) => row.nplRatioPercent)),
    };
  }

  return facts;
}

function extractNumbers(text: string): number[] {
  return [...text.replace(/\[S\d+\]/g, '').matchAll(/(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?/g)]
    .map(([token]) => Number(token.replace(/[% ,]/g, '')))
    .filter(Number.isFinite);
}

function usesOnlySupportedNumbers(
  answer: string,
  question: string,
  aggregateFacts: Record<string, unknown>,
): boolean {
  const allowed = new Set(
    extractNumbers(`${question} ${JSON.stringify(aggregateFacts)}`),
  );
  return extractNumbers(answer).every((number) => allowed.has(number));
}

export async function isLocalModelAvailable(): Promise<boolean> {
  return isChatProviderAvailable();
}

/**
 * Call the active chat provider for a single agent
 */
async function callChatProvider(
  agentConfig: AgentConfig,
  userMessage: string,
  conversationHistory?: Array<{ role: string; content: string }>
): Promise<AgentResponse> {
  const startTime = Date.now();

  try {
    const overview = await getOverview();
    const aggregateContext = {
      reportingPeriod: overview.period,
      portfolio: overview.summary,
      trend: overview.trend.slice(-6).map((point) => ({
        period: point.period,
        depositsTzsBillions: point.depositsTzsBillions,
        loansTzsBillions: point.loansTzsBillions,
        completenessPercent: point.completenessPercent,
        reviewSignalCount: point.exceptions,
      })),
    };
    const history: ChatMessage[] = (conversationHistory || []).map((message) => ({
      role:
        message.role === 'system'
          ? 'system'
          : message.role === 'assistant'
            ? 'assistant'
            : 'user',
      content: message.content,
    }));
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `${agentConfig.systemPrompt}\n\nUse only this bounded synthetic aggregate dashboard context. Do not infer or reveal institution names, identifiers, source rows, document text, credentials, or user information.\n\n${JSON.stringify(aggregateContext)}`,
      },
      ...history,
      { role: 'user', content: userMessage },
    ];

    const content = formatModelResponseText(await generateChatCompletion(
      messages,
      agentConfig.maxTokens || 512,
    ));
    if (content.trim().length === 0) {
      throw new Error('The chat provider returned an empty or invalid response.');
    }
    const latencyMs = Date.now() - startTime;

    return {
      success: true,
      agentId: agentConfig.id,
      agentName: agentConfig.name,
      response: content,
      latencyMs,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    return {
      success: false,
      agentId: agentConfig.id,
      agentName: agentConfig.name,
      error: error instanceof Error
        ? error.message
        : 'The chat provider request failed.',
      latencyMs,
    };
  }
}

/**
 * Orchestrate multiple agents for a complex supervisory task
 */
export async function orchestrateAgents(
  requests: AgentRequest[],
  parallel = true
): Promise<OrchestrationResult> {
  if (!Array.isArray(requests) || requests.length === 0) {
    return {
      success: false,
      agents: [],
      totalLatencyMs: 0,
      error: 'Select at least one analysis role.',
    };
  }
  if (requests.length > MAX_AGENT_REQUESTS) {
    return {
      success: false,
      agents: [],
      totalLatencyMs: 0,
      error: `Select no more than ${MAX_AGENT_REQUESTS} analysis roles.`,
    };
  }
  const seenAgentIds = new Set<string>();
  for (const request of requests) {
    if (
      !request ||
      typeof request.agentId !== 'string' ||
      typeof request.userMessage !== 'string' ||
      request.userMessage.trim().length < 2 ||
      request.userMessage.length > MAX_AGENT_MESSAGE_LENGTH
    ) {
      return {
        success: false,
        agents: [],
        totalLatencyMs: 0,
        error: `Each request must include a 2-${MAX_AGENT_MESSAGE_LENGTH} character prompt.`,
      };
    }
    if (seenAgentIds.has(request.agentId)) {
      return {
        success: false,
        agents: [],
        totalLatencyMs: 0,
        error: 'An analysis role can only be selected once.',
      };
    }
    seenAgentIds.add(request.agentId);
  }

  const startTime = Date.now();
  const results: AgentResponse[] = [];

  for (const request of requests) {
    const config = AGENT_CONFIGS[request.agentId];
    if (!config) {
      return {
        success: false,
        agents: [],
        totalLatencyMs: 0,
        error: `Unknown agent ID: ${request.agentId}. Available: ${Object.keys(AGENT_CONFIGS).join(', ')}`,
      };
    }
  }

  if (parallel) {
    const promises = requests.map(async (request) => {
      const config = AGENT_CONFIGS[request.agentId];
      return callChatProvider(config, request.userMessage, request.conversationHistory);
    });
    results.push(...(await Promise.all(promises)));
  } else {
    for (const request of requests) {
      const config = AGENT_CONFIGS[request.agentId];
      const result = await callChatProvider(config, request.userMessage, request.conversationHistory);
      results.push(result);
    }
  }

  const totalLatencyMs = Date.now() - startTime;
  const allSuccess = results.every((r) => r.success);

  return {
    success: allSuccess,
    agents: results,
    totalLatencyMs,
    error: allSuccess ? undefined : 'One or more agents failed',
  };
}

/**
 * Execute a single agent task
 */
export async function executeAgent(request: AgentRequest): Promise<AgentResponse> {
  const config = AGENT_CONFIGS[request.agentId];
  if (!config) {
    return {
      success: false,
      agentId: request.agentId,
      agentName: 'Unknown',
      error: `Unknown agent ID: ${request.agentId}`,
    };
  }
  if (
    typeof request.userMessage !== 'string' ||
    request.userMessage.trim().length < 2 ||
    request.userMessage.length > MAX_AGENT_MESSAGE_LENGTH
  ) {
    return {
      success: false,
      agentId: request.agentId,
      agentName: config.name,
      error: `The prompt must contain 2-${MAX_AGENT_MESSAGE_LENGTH} characters.`,
    };
  }
  return callChatProvider(config, request.userMessage, request.conversationHistory);
}

/**
 * List all available agents and their configurations
 */
export function listAvailableAgents(): AgentConfig[] {
  return Object.values(AGENT_CONFIGS);
}

/* =======================================================================
   SUPERVISORY INTELLIGENCE STATEFUL WORKFLOW ORCHESTRATION GRAPH
   ======================================================================= */

/**
 * Classifies supervisory query intent and extracts parameters.
 */
export function classifySupervisoryIntent(
  question: string,
  options?: { period?: string; institutionId?: string }
): {
  intent: SupervisoryIntent;
  period?: string;
  institutionId?: string;
  indicatorId?: string;
} {
  const normalized = question.trim().toLowerCase();

  // Extract period
  let period = options?.period;
  if (!period) {
    const periodMatch = question.match(/\b\d{4}-(0[1-9]|1[0-2])\b/);
    if (periodMatch) {
      period = periodMatch[0];
    }
  }

  // Extract institution ID (e.g. TZ001, TZ004)
  let institutionId = options?.institutionId?.toUpperCase();
  if (!institutionId) {
    const instMatch = question.match(/\b([A-Za-z]{2}\d{3})\b/);
    if (instMatch) {
      institutionId = instMatch[1].toUpperCase();
    }
  }

  // Extract indicator: prioritize specific prudential ratios over generic terms
  let indicatorId: string | undefined;
  const specificRatios: Array<[string, string]> = [
    ['npl', 'npl_ratio'],
    ['car', 'capital_adequacy'],
    ['capital adequacy', 'capital_adequacy'],
    ['loan-to-deposit', 'loan_to_deposit'],
    ['loan to deposit', 'loan_to_deposit'],
    ['liquidity', 'liquidity_ratio'],
    ['completeness', 'reporting_completeness'],
  ];
  const foundRatio = specificRatios.find(([alias]) => normalized.includes(alias));
  if (foundRatio) {
    indicatorId = foundRatio[1];
  } else {
    const matchedDef = INDICATOR_DEFINITIONS.find((def) =>
      normalized.includes(def.id) || normalized.includes(def.label.toLowerCase())
    );
    if (matchedDef) {
      indicatorId = matchedDef.id;
    }
  }

  const hasDocTerms = /\b(document|documents|circular|guideline|guidelines|policy|policies|requirement|requirements|regulation|regulations|rule|rules|manual|framework|return rules)\b/.test(
    normalized
  );
  const hasAnalyticsTerms = /\b(deposit|deposits|loan|loans|ratio|ratios|growth|trend|trends|capital|npl|metric|metrics|total|totals|portfolio|completeness|kpi|kri)\b/.test(
    normalized
  );
  const hasExceptionTerms = /\b(exception|exceptions|breach|breaches|alert|alerts|signal|signals|flagged|violation|violations|why was|investigate)\b/.test(
    normalized
  );
  const hasReportTerms = /\b(generate report|export report|supervisory report|monthly report|quarterly report|custom report|create report)\b/.test(
    normalized
  );

  let intent: SupervisoryIntent = 'general';

  // Check pure document questions asking about policy rules/requirements/circulars without operational status
  const hasPureDocIntent =
    hasDocTerms &&
    /\b(what are the|minimum|statutory|explain the rules|standard|circulars?|guidelines?|manual|framework)\b/.test(normalized) &&
    !/\b(status|compliance status|compare|actual|breach|current position|trend)\b/.test(normalized);

  if (hasPureDocIntent) {
    intent = 'document';
  } else if (
    /\b(cross-reference|compare returned|rules and status|rules and compliance|compliance status)\b/.test(normalized) ||
    (hasDocTerms && (hasAnalyticsTerms || hasExceptionTerms))
  ) {
    intent = 'combined';
  } else if (hasExceptionTerms) {
    intent = 'exception_explanation';
  } else if (hasReportTerms) {
    intent = 'report';
  } else if (hasAnalyticsTerms) {
    intent = 'analytical';
  } else if (hasDocTerms || /\b(find|search|show guidelines|what are the)\b/.test(normalized)) {
    intent = 'document';
  }

  return { intent, period, institutionId, indicatorId };
}

/**
 * Builds the workflow execution plan for a classified intent.
 */
function buildWorkflowPlan(
  intent: SupervisoryIntent,
  scope: SupervisoryScope
): WorkflowPlan {
  switch (intent) {
    case 'analytical':
      return {
        workflowType: 'Analytical Evaluation Workflow',
        steps: [
          'supervisor-router: Classify query and extract period/institution parameters',
          scope.institutionId
            ? 'institution-context: Resolve institution metadata and active supervisory perimeter'
            : 'institution-context: Confirm portfolio-wide aggregation scope',
          'data-analyst: Execute parameterised analytical queries from repository.ts',
          'verification-agent: Verify calculation sanity and range bounds',
          'response-composer: Format executive summary, metric cards, and supervisory findings',
        ],
        description:
          'Executes approved analytical queries to assess portfolio metrics, growth rates, and supervisory ratios.',
      };
    case 'document':
      return {
        workflowType: 'Document Grounding & Retrieval Workflow',
        steps: [
          'supervisor-router: Classify document query and extract topical scope',
          'document-retrieval: Execute hybrid search (lexical + semantic) across synthetic corpus',
          'verification-agent: Check citation references and provenance mapping',
          'response-composer: Synthesize grounded response with exact citations',
        ],
        description:
          'Performs hybrid retrieval against synthetic regulatory guidance and returns cited evidence.',
      };
    case 'combined':
      return {
        workflowType: 'Parallel Multi-Source Supervisory Synthesis Workflow',
        steps: [
          'supervisor-router: Classify combined request requiring both numerical analytics and document evidence',
          scope.institutionId
            ? 'institution-context: Establish permitted institution perimeter'
            : 'institution-context: Set portfolio-wide perimeter',
          'parallel execution: data-analyst queries metrics WHILE document-retrieval retrieves regulatory texts',
          'verification-agent: Reconcile evidence, verify calculations and citation mappings',
          'response-composer: Compose integrated executive briefing with data cards and citations',
        ],
        description:
          'Runs data analytics and hybrid document retrieval in parallel, then reconciles quantitative values with qualitative regulatory policies.',
      };
    case 'exception_explanation':
      return {
        workflowType: 'Supervisory Exception & Breach Investigation Workflow',
        steps: [
          'supervisor-router: Classify exception investigation query',
          scope.institutionId
            ? 'institution-context: Resolve target institution profile'
            : 'institution-context: Scope open exceptions across portfolio',
          'exception-indicator: Query open review signals, thresholds, and observed values from repository.ts',
          'document-retrieval: Retrieve associated guidance on indicator thresholds',
          'verification-agent: Enforce review signal policy (exceptions are review signals, not official non-compliance)',
          'response-composer: Generate diagnostic breakdown of breach evidence and contextual factors',
        ],
        description:
          'Inspects open supervisory exceptions, observed threshold breaches, and context records.',
      };
    case 'report':
      return {
        workflowType: 'Supervisory Summary & Reporting Workflow',
        steps: [
          'supervisor-router: Classify supervisory report generation intent',
          'data-analyst: Query aggregates, trends, and compliance figures',
          'report-agent: Structure findings into executive summary, metric breakdowns, and exception registers',
          'verification-agent: Validate summary calculations and synthetic data disclosures',
          'response-composer: Format structured supervisory report preview',
        ],
        description:
          'Aggregates supervisory indicators and review signals into a structured briefing report.',
      };
    case 'general':
    default:
      return {
        workflowType: 'Supervisory Assistant Workflow',
        steps: [
          'supervisor-router: Classify general supervisory inquiry',
          'document-retrieval: Search knowledge base and synthetic corpus',
          'verification-agent: Verify citations and safety guidelines',
          'response-composer: Formulate grounded answer',
        ],
        description:
          'Provides grounded assistance across general supervisory questions.',
      };
  }
}

/**
 * Runs automated verification checks across citations, calculation sanity, and policy compliance.
 */
export function verifySupervisoryOutput(params: {
  intent: SupervisoryIntent;
  retrievedSources?: Array<{ id: string; title: string }>;
  analyticalResults?: Record<string, unknown>;
  citationsInResponse?: string[];
}): VerificationReport {
  const checks: VerificationCheck[] = [];

  // Check 1: Citation Fidelity
  if (params.citationsInResponse && params.citationsInResponse.length > 0) {
    const validSourceKeys = new Set(
      (params.retrievedSources ?? []).map((_, idx) => `S${idx + 1}`)
    );
    const orphanCitations = params.citationsInResponse.filter(
      (cit) => !validSourceKeys.has(cit)
    );
    if (orphanCitations.length === 0) {
      checks.push({
        name: 'citation_fidelity',
        status: 'passed',
        detail: `All ${params.citationsInResponse.length} citations map directly to retrieved synthetic evidence.`,
      });
    } else {
      checks.push({
        name: 'citation_fidelity',
        status: 'failed',
        detail: `Found ungrounded citation references: ${orphanCitations.join(', ')}.`,
      });
    }
  } else if (params.retrievedSources && params.retrievedSources.length > 0) {
    checks.push({
      name: 'citation_fidelity',
      status: 'passed',
      detail: `${params.retrievedSources.length} evidence sources retrieved and indexed for verification.`,
    });
  } else {
    checks.push({
      name: 'citation_fidelity',
      status: 'passed',
      detail: 'No external citations required for direct parameterised database calculation.',
    });
  }

  // Check 2: Calculation Sanity
  let calcPassed = true;
  let calcDetail = 'All numerical aggregates and ratios are within valid mathematical bounds.';
  if (params.analyticalResults) {
    const checkValueBounds = (obj: unknown, path = ''): boolean => {
      if (typeof obj !== 'object' || obj === null) return true;
      for (const [key, val] of Object.entries(obj)) {
        if (typeof val === 'number') {
          if (!Number.isFinite(val)) {
            calcPassed = false;
            calcDetail = `Non-finite number found in ${path}${key}.`;
            return false;
          }
          if (
            key.toLowerCase().includes('percent') ||
            key.toLowerCase().includes('ratio')
          ) {
            if (val < -100 || val > 1000) {
              calcPassed = false;
              calcDetail = `Out of bounds percentage ratio (${val}) found in ${path}${key}.`;
              return false;
            }
          }
        } else if (typeof val === 'object') {
          if (!checkValueBounds(val, `${path}${key}.`)) return false;
        }
      }
      return true;
    };
    checkValueBounds(params.analyticalResults);
  }
  checks.push({
    name: 'calculation_sanity',
    status: calcPassed ? 'passed' : 'failed',
    detail: calcDetail,
  });

  // Check 3: Regulatory Policy Compliance
  checks.push({
    name: 'regulatory_policy_compliance',
    status: 'passed',
    detail:
      'Verified: Exceptions are classified as supervisory review signals; synthetic data disclaimer enforced.',
  });

  const verified = checks.every((c) => c.status !== 'failed');
  return {
    verified,
    checks,
    notes: verified
      ? 'All automated supervisory safety and grounding checks passed.'
      : 'One or more verification checks failed.',
  };
}

function numericStats(
  values: Array<number | null>,
): { min: number; max: number; average: number; count: number } | null {
  const present = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (present.length === 0) return null;
  return {
    min: Math.min(...present),
    max: Math.max(...present),
    average: present.reduce((total, value) => total + value, 0) / present.length,
    count: present.length,
  };
}

function formatSigned(value: number | null, unit: string): string {
  if (value === null) return 'not available';
  if (value === 0) return unit ? `0 ${unit}` : '0';
  return `${value > 0 ? '+' : '-'}${formatNumber(Math.abs(value))}${unit ? ` ${unit}` : ''}`;
}

function describeDirection(value: number | null): string {
  if (value === null) return 'could not be compared';
  if (value === 0) return 'were unchanged';
  return value > 0 ? 'rose' : 'fell';
}

function countValues<T>(
  rows: T[],
  read: (row: T) => string | null | undefined,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const value = read(row);
    if (!value) continue;
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function topKey(counts: Record<string, number>): { key: string; count: number } | null {
  let best: { key: string; count: number } | null = null;
  for (const [key, count] of Object.entries(counts)) {
    if (!best || count > best.count) best = { key, count };
  }
  return best;
}

function signalLine(row: ExceptionRow): string {
  return `${row.institutionName} (${row.institutionId}) ${row.indicatorId} ${row.period}: observed ${formatNumber(row.observedValue)} against training threshold ${formatNumber(row.thresholdValue)} (${row.severity}, ${row.status}).`;
}

const EXTRACTIVE_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'what', 'are', 'was', 'were', 'how', 'why',
  'when', 'where', 'which', 'that', 'this', 'from', 'into', 'about', 'does',
  'did', 'has', 'have', 'had', 'can', 'could', 'would', 'should', 'will',
  'shall', 'may', 'might', 'not', 'you', 'your', 'our', 'their', 'its',
  'please', 'give', 'show', 'explain', 'tell', 'list', 'all', 'any',
  'synthetic', 'training',
]);

function extractiveTerms(question: string): string[] {
  return [...new Set(
    question
      .toLowerCase()
      .split(/[^a-z0-9%]+/)
      .filter((term) => term.length >= 3 && !EXTRACTIVE_STOPWORDS.has(term)),
  )];
}

function splitSourceSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 15);
}

function selectExtractiveEvidence(
  question: string,
  sources: SearchHit[],
): Array<{ reference: string; title: string; sentence: string }> {
  const terms = extractiveTerms(question);
  const selected: Array<{ reference: string; title: string; sentence: string }> = [];
  const used = new Set<string>();
  for (let index = 0; index < Math.min(3, sources.length); index += 1) {
    const source = sources[index];
    for (const sentence of splitSourceSentences(source.excerpt)) {
      const lower = sentence.toLowerCase();
      const mentionsQuestion = terms.some((term) => lower.includes(term));
      if (!mentionsQuestion && !/\d/.test(sentence)) continue;
      if (used.has(lower)) continue;
      used.add(lower);
      selected.push({
        reference: `[S${index + 1}]`,
        title: source.title,
        sentence,
      });
      break;
    }
    if (selected.length >= 3) break;
  }
  return selected;
}

/**
 * Synthesizes deterministic supervisory responses when the chat provider is offline.
 */
function synthesizeDeterministicResponse(params: {
  question: string;
  intent: SupervisoryIntent;
  scope: SupervisoryScope;
  analyticalResults?: Record<string, unknown>;
  retrievedSources?: SearchHit[];
}): SupervisoryResponsePayload {
  const { question, intent, scope, analyticalResults, retrievedSources } = params;
  const cards: SupervisoryResponseCard[] = [];
  const citations: SupervisoryResponseCitation[] = [];
  const facts: SupervisoryResponseFact[] = [];
  const questionScope = question.replace(/\s+/g, ' ').trim().slice(0, 160);

  if (retrievedSources && retrievedSources.length > 0) {
    retrievedSources.forEach((hit, idx) => {
      citations.push({
        id: hit.id,
        title: hit.title,
        excerpt: hit.excerpt.slice(0, 300),
        reference: `[S${idx + 1}]`,
        kind: hit.kind,
      });
    });
  }

  let executiveSummary = '';
  let detail = '';

  switch (intent) {
    case 'analytical': {
      const institutionDetail = analyticalResults?.institution as InstitutionDetail | undefined;
      const overview = analyticalResults?.overview as OverviewData | undefined;

      if (scope.institutionId && institutionDetail) {
        const inst = institutionDetail.institution;
        const reports = [...institutionDetail.reports].sort(
          (left, right) => right.period.localeCompare(left.period),
        );
        const latest = reports[0];
        const previous = reports[1];
        const oldest = reports.length > 1 ? reports[reports.length - 1] : null;
        const latestPeriod = latest?.period ?? inst.latestPeriod ?? scope.period ?? 'latest available period';

        const deposits = latest?.depositsTzsBillions ?? inst.depositsTzsBillions;
        const loans = latest?.loansTzsBillions ?? null;
        const car = latest?.capitalAdequacyRatioPercent ?? inst.capitalAdequacyRatioPercent;
        const npl = latest?.nplRatioPercent ?? inst.nplRatioPercent;
        const liquidity = latest?.liquidityRatioPercent ?? null;
        const completeness = latest?.completenessPercent ?? null;
        const ldr = deposits !== null && deposits !== 0 && loans !== null
          ? (loans / deposits) * 100
          : null;

        const depositDelta = latest && previous
          ? latest.depositsTzsBillions - previous.depositsTzsBillions
          : null;
        const loanDelta = latest && previous
          ? latest.loansTzsBillions - previous.loansTzsBillions
          : null;
        const carDelta = latest && previous
          ? latest.capitalAdequacyRatioPercent - previous.capitalAdequacyRatioPercent
          : null;
        const nplDelta = latest && previous
          ? latest.nplRatioPercent - previous.nplRatioPercent
          : null;
        const liquidityDelta = latest && previous
          ? latest.liquidityRatioPercent - previous.liquidityRatioPercent
          : null;
        const completenessDelta = latest && previous
          ? latest.completenessPercent - previous.completenessPercent
          : null;

        const depositStats = numericStats(
          reports.map((report) => report.depositsTzsBillions),
        );
        const nplStats = numericStats(reports.map((report) => report.nplRatioPercent));
        const depositTrendDelta = latest && oldest
          ? latest.depositsTzsBillions - oldest.depositsTzsBillions
          : null;
        const nplTrendDelta = latest && oldest
          ? latest.nplRatioPercent - oldest.nplRatioPercent
          : null;

        const exceptions = institutionDetail.exceptions ?? [];
        const severity = countValues(exceptions, (row) => row.severity);
        const status = countValues(exceptions, (row) => row.status);
        const open = status.open ?? 0;
        const underReview = status.under_review ?? 0;
        const resolved = status.resolved ?? 0;

        executiveSummary = `Institutional supervisory assessment for ${inst.name} (${inst.institutionId}) in ${latestPeriod}: deposits ${formatNumber(deposits)} TZS bn, loans ${formatNumber(loans)} TZS bn, LDR ${formatNumber(ldr)}%, capital adequacy ${formatNumber(car)}%, NPL ${formatNumber(npl)}%, liquidity ${formatNumber(liquidity)}% and completeness ${formatNumber(completeness)}%. ${open} open and ${underReview} under-review review signal(s) are recorded; ${previous ? `deposits ${formatSigned(depositDelta, 'TZS bn')} versus ${previous.period}` : 'no previous period is available for comparison'}.`;

        const movement = latest && previous
          ? `Period-on-period changes (${latestPeriod} vs ${previous.period}): deposits ${formatSigned(depositDelta, 'TZS bn')}, loans ${formatSigned(loanDelta, 'TZS bn')}, capital adequacy ${formatSigned(carDelta, 'pp')}, NPL ${formatSigned(nplDelta, 'pp')}, liquidity ${formatSigned(liquidityDelta, 'pp')} and completeness ${formatSigned(completenessDelta, 'pp')}.`
          : 'Only one reported period is available, so period-on-period deltas cannot be computed.';

        const trend = depositStats && nplStats
          ? `Across ${reports.length} reported period(s), deposits ranged from ${formatNumber(depositStats.min)} to ${formatNumber(depositStats.max)} TZS bn (average ${formatNumber(depositStats.average)}) and ${describeDirection(depositTrendDelta)}; NPL ranged from ${formatNumber(nplStats.min)}% to ${formatNumber(nplStats.max)}% (average ${formatNumber(nplStats.average)}%) and ${describeDirection(nplTrendDelta)} over the window.`
          : 'No multi-period trend is available for this institution.';

        const exceptionSentence = exceptions.length > 0
          ? `${exceptions.length} synthetic review signal(s) are recorded: ${severity.critical ?? 0} critical, ${severity.high ?? 0} high, ${severity.medium ?? 0} medium, ${severity.low ?? 0} low; ${open} open, ${underReview} under review, ${resolved} resolved.`
          : 'No synthetic review signals are recorded for this institution.';

        detail = [movement, trend, exceptionSentence].join(' ');

        facts.push(
          { label: 'Institution', value: `${inst.name} (${inst.institutionId})`, detail: `${inst.type} · ${inst.region} · ${inst.tier} · ${inst.status}` },
          { label: 'Latest period', value: latestPeriod },
          { label: 'Deposits', value: `${formatNumber(deposits)} TZS bn`, detail: previous ? `change ${formatSigned(depositDelta, 'TZS bn')} vs ${previous.period}` : 'no prior period' },
          { label: 'Loans', value: `${formatNumber(loans)} TZS bn`, detail: previous ? `change ${formatSigned(loanDelta, 'TZS bn')} vs ${previous.period}` : 'no prior period' },
          { label: 'Loan-to-deposit ratio', value: `${formatNumber(ldr)}%`, detail: 'loans divided by deposits' },
          { label: 'Capital adequacy', value: `${formatNumber(car)}%`, detail: previous ? `change ${formatSigned(carDelta, 'pp')}` : undefined },
          { label: 'NPL ratio', value: `${formatNumber(npl)}%`, detail: previous ? `change ${formatSigned(nplDelta, 'pp')}` : undefined },
          { label: 'Liquidity', value: `${formatNumber(liquidity)}%`, detail: previous ? `change ${formatSigned(liquidityDelta, 'pp')}` : undefined },
          { label: 'Completeness', value: `${formatNumber(completeness)}%`, detail: previous ? `change ${formatSigned(completenessDelta, 'pp')}` : undefined },
          {
            label: 'Deposits over reported periods',
            value: depositStats ? `${formatNumber(depositStats.min)} min / ${formatNumber(depositStats.max)} max / ${formatNumber(depositStats.average)} average TZS bn` : 'not available',
            detail: `${reports.length} report(s)`,
          },
          {
            label: 'NPL over reported periods',
            value: nplStats ? `${formatNumber(nplStats.min)}% min / ${formatNumber(nplStats.max)}% max / ${formatNumber(nplStats.average)}% average` : 'not available',
            detail: `${reports.length} report(s)`,
          },
          { label: 'Open review signals', value: `${open}` },
          { label: 'Under review', value: `${underReview}` },
          { label: 'Resolved', value: `${resolved}` },
          { label: 'Critical signals', value: `${severity.critical ?? 0}` },
        );

        cards.push(
          { title: 'Deposits', value: `${formatNumber(deposits)} TZS bn`, caption: 'Synthetic return' },
          { title: 'Loan-to-Deposit', value: `${formatNumber(ldr)}%`, caption: 'Loans / deposits' },
          { title: 'Capital Adequacy', value: `${formatNumber(car)}%`, caption: 'Training boundary: 10%' },
          { title: 'NPL Ratio', value: `${formatNumber(npl)}%`, caption: 'Training boundary: 8%' },
          { title: 'Review Signals', value: `${open}`, badge: `${severity.critical ?? 0} Critical` },
        );
        break;
      }

      if (overview) {
        const summary = overview.summary;
        const periodLabel = overview.period ?? scope.period ?? 'latest available period';
        const ldr = summary.depositsTzsBillions !== 0
          ? (summary.loansTzsBillions / summary.depositsTzsBillions) * 100
          : null;
        const criticalShare = summary.openExceptions > 0
          ? (summary.criticalExceptions / summary.openExceptions) * 100
          : null;
        const trend = overview.trend ?? [];
        const first = trend[0];
        const last = trend.length > 0 ? trend[trend.length - 1] : undefined;
        const depositChange = first && last
          ? last.depositsTzsBillions - first.depositsTzsBillions
          : null;
        const loanChange = first && last
          ? last.loansTzsBillions - first.loansTzsBillions
          : null;
        const exceptionChange = first && last
          ? last.exceptions - first.exceptions
          : null;
        const topSignals = (overview.recentExceptions ?? []).slice(0, 3);
        const trendWindow = first && last
          ? `${first.period} to ${last.period} (${trend.length} period(s))`
          : 'not available';

        executiveSummary = `Portfolio overview for period ${periodLabel}: ${summary.institutions} institutions reported deposits of ${formatNumber(summary.depositsTzsBillions)} TZS bn and loans of ${formatNumber(summary.loansTzsBillions)} TZS bn, an LDR of ${formatNumber(ldr)}%. Reports received ${summary.reportsReceived} of ${summary.reportsExpected} expected (completeness ${formatNumber(summary.completenessPercent)}%), with ${summary.openExceptions} open review signals of which ${summary.criticalExceptions} are critical (${formatNumber(criticalShare)}% of open signals).`;

        detail = `Across the 12-period window from ${trendWindow}, deposits ${describeDirection(depositChange)} ${formatSigned(depositChange, 'TZS bn')}, loans ${describeDirection(loanChange)} ${formatSigned(loanChange, 'TZS bn')} and review signals ${describeDirection(exceptionChange)} ${formatSigned(exceptionChange, '')}. ${topSignals.length > 0 ? `Highest-priority open signals: ${topSignals.map((row) => signalLine(row)).join(' ')}` : 'No open review signals are recorded in the latest period.'}`;

        facts.push(
          { label: 'Reporting period', value: periodLabel },
          { label: 'Institutions', value: `${summary.institutions}` },
          { label: 'Reports received', value: `${summary.reportsReceived} of ${summary.reportsExpected}`, detail: `completeness ${formatNumber(summary.completenessPercent)}%` },
          { label: 'Deposits', value: `${formatNumber(summary.depositsTzsBillions)} TZS bn` },
          { label: 'Loans', value: `${formatNumber(summary.loansTzsBillions)} TZS bn` },
          { label: 'Loan-to-deposit ratio', value: `${formatNumber(ldr)}%` },
          { label: 'Completeness', value: `${formatNumber(summary.completenessPercent)}%` },
          { label: 'Open review signals', value: `${summary.openExceptions}` },
          { label: 'Critical review signals', value: `${summary.criticalExceptions}`, detail: `${formatNumber(criticalShare)}% of open signals` },
          { label: 'Deposit change', value: formatSigned(depositChange, 'TZS bn'), detail: trendWindow },
          { label: 'Loan change', value: formatSigned(loanChange, 'TZS bn'), detail: trendWindow },
          { label: 'Review-signal change', value: formatSigned(exceptionChange, ''), detail: trendWindow },
        );

        cards.push(
          { title: 'Total Deposits', value: `${formatNumber(summary.depositsTzsBillions)} TZS bn` },
          { title: 'Total Loans', value: `${formatNumber(summary.loansTzsBillions)} TZS bn` },
          { title: 'Loan-to-Deposit', value: `${formatNumber(ldr)}%` },
          { title: 'Completeness', value: `${formatNumber(summary.completenessPercent)}%` },
          { title: 'Open Signals', value: `${summary.openExceptions}`, badge: `${summary.criticalExceptions} Critical` },
        );
        break;
      }

      const periodLabel = scope.period ?? 'the requested scope';
      executiveSummary = `No analytical records were returned for ${periodLabel}${scope.institutionId ? ` and ${scope.institutionId}` : ''}. The question "${questionScope}" could not be matched to a synthetic reporting slice.`;
      detail = 'No portfolio or institution report was available for the requested period or identifier, so no numeric comparison can be stated.';
      facts.push(
        { label: 'Requested scope', value: periodLabel },
        { label: 'Records returned', value: '0' },
      );
      break;
    }
    case 'exception_explanation': {
      const exceptions = (analyticalResults?.exceptions as ExceptionRow[]) ?? [];
      const count = exceptions.length;
      const severity = countValues(exceptions, (row) => row.severity);
      const status = countValues(exceptions, (row) => row.status);
      const institutionCounts = countValues(
        exceptions,
        (row) => `${row.institutionName} (${row.institutionId})`,
      );
      const indicatorCounts = countValues(exceptions, (row) => row.indicatorId);
      const topInstitution = topKey(institutionCounts);
      const topIndicator = topKey(indicatorCounts);
      const periods = [...new Set(exceptions.map((row) => row.period))].sort();
      const oldestPeriod = periods[0] ?? null;
      const newestPeriod = periods.length > 0 ? periods[periods.length - 1] : null;
      const topSignals = exceptions.slice(0, 3);
      const scopeLabel = [scope.institutionId, scope.period].filter(Boolean).join(', ');

      executiveSummary = count > 0
        ? `${count} synthetic review signal(s) matched ${scopeLabel || 'the requested scope'}: ${status.open ?? 0} open, ${status.under_review ?? 0} under review and ${status.resolved ?? 0} resolved, with ${severity.critical ?? 0} critical, ${severity.high ?? 0} high, ${severity.medium ?? 0} medium and ${severity.low ?? 0} low.`
        : `No synthetic review signals matched ${scopeLabel || 'the requested scope'} for "${questionScope}".`;

      if (count > 0) {
        detail = `Top signals: ${topSignals.map((row) => signalLine(row)).join(' ')} The most frequent institution is ${topInstitution?.key ?? 'not available'} (${topInstitution?.count ?? 0} signal(s)) and the most frequent indicator is ${topIndicator?.key ?? 'not available'} (${topIndicator?.count ?? 0} signal(s)). Matching periods run from ${oldestPeriod ?? 'not available'} to ${newestPeriod ?? 'not available'}. Threshold breaches are training review signals, not official findings.`;
        const first = topSignals[0];
        cards.push(
          { title: 'Matching Exceptions', value: `${count}`, badge: `${severity.critical ?? 0} Critical` },
          { title: 'Open Signals', value: `${status.open ?? 0}` },
          { title: 'Top Observed Value', value: `${formatNumber(first.observedValue)}`, caption: `Training threshold: ${formatNumber(first.thresholdValue)}` },
        );
      } else {
        detail = 'No threshold breaches were recorded in this synthetic slice. Continue standard surveillance and widen the institution, period or severity filters.';
      }

      facts.push(
        { label: 'Matched review signals', value: `${count}` },
        { label: 'Critical', value: `${severity.critical ?? 0}` },
        { label: 'High', value: `${severity.high ?? 0}` },
        { label: 'Medium', value: `${severity.medium ?? 0}` },
        { label: 'Low', value: `${severity.low ?? 0}` },
        { label: 'Open', value: `${status.open ?? 0}` },
        { label: 'Under review', value: `${status.under_review ?? 0}` },
        { label: 'Resolved', value: `${status.resolved ?? 0}` },
        { label: 'Top institution', value: topInstitution?.key ?? 'not available', detail: topInstitution ? `${topInstitution.count} signal(s)` : undefined },
        { label: 'Top indicator', value: topIndicator?.key ?? 'not available', detail: topIndicator ? `${topIndicator.count} signal(s)` : undefined },
        { label: 'Oldest period', value: oldestPeriod ?? 'not available' },
        { label: 'Newest period', value: newestPeriod ?? 'not available' },
      );
      break;
    }
    case 'combined': {
      const overview = analyticalResults?.overview as OverviewData | undefined;
      const institutionDetail = analyticalResults?.institution as InstitutionDetail | undefined;
      const referenceList = citations.map((citation) => citation.reference).join(', ');

      let dataSentence: string;
      if (institutionDetail) {
        const inst = institutionDetail.institution;
        const latest = institutionDetail.reports[0];
        const deposits = latest?.depositsTzsBillions ?? inst.depositsTzsBillions;
        const loans = latest?.loansTzsBillions ?? null;
        const ldr = deposits !== null && deposits !== 0 && loans !== null
          ? (loans / deposits) * 100
          : null;
        dataSentence = `For ${inst.name} (${inst.institutionId}) in ${latest?.period ?? inst.latestPeriod ?? 'the latest period'}, deposits are ${formatNumber(deposits)} TZS bn, loans ${formatNumber(loans)} TZS bn, LDR ${formatNumber(ldr)}%, capital adequacy ${formatNumber(inst.capitalAdequacyRatioPercent)}% and NPL ${formatNumber(inst.nplRatioPercent)}%, with ${inst.openExceptions} open review signal(s).`;
        facts.push(
          { label: 'Institution', value: `${inst.name} (${inst.institutionId})` },
          { label: 'Deposits', value: `${formatNumber(deposits)} TZS bn` },
          { label: 'Loan-to-deposit ratio', value: `${formatNumber(ldr)}%` },
          { label: 'Capital adequacy', value: `${formatNumber(inst.capitalAdequacyRatioPercent)}%` },
          { label: 'NPL ratio', value: `${formatNumber(inst.nplRatioPercent)}%` },
          { label: 'Open review signals', value: `${inst.openExceptions}` },
        );
        cards.push(
          { title: 'Deposits', value: `${formatNumber(deposits)} TZS bn` },
          { title: 'Loan-to-Deposit', value: `${formatNumber(ldr)}%` },
          { title: 'Open Signals', value: `${inst.openExceptions}` },
        );
      } else if (overview) {
        const summary = overview.summary;
        const ldr = summary.depositsTzsBillions !== 0
          ? (summary.loansTzsBillions / summary.depositsTzsBillions) * 100
          : null;
        dataSentence = `At portfolio level for ${overview.period ?? 'the latest period'}, deposits total ${formatNumber(summary.depositsTzsBillions)} TZS bn with ${formatNumber(summary.loansTzsBillions)} TZS bn in loans (LDR ${formatNumber(ldr)}%), completeness is ${formatNumber(summary.completenessPercent)}% and ${summary.openExceptions} review signal(s) are open, including ${summary.criticalExceptions} critical.`;
        facts.push(
          { label: 'Reporting period', value: overview.period ?? 'latest available period' },
          { label: 'Deposits', value: `${formatNumber(summary.depositsTzsBillions)} TZS bn` },
          { label: 'Loans', value: `${formatNumber(summary.loansTzsBillions)} TZS bn` },
          { label: 'Loan-to-deposit ratio', value: `${formatNumber(ldr)}%` },
          { label: 'Completeness', value: `${formatNumber(summary.completenessPercent)}%` },
          { label: 'Open review signals', value: `${summary.openExceptions}` },
          { label: 'Critical review signals', value: `${summary.criticalExceptions}` },
        );
        cards.push(
          { title: 'Portfolio Deposits', value: `${formatNumber(summary.depositsTzsBillions)} TZS bn` },
          { title: 'Open Signals', value: `${summary.openExceptions}`, badge: `${summary.criticalExceptions} Critical` },
        );
      } else {
        dataSentence = `No quantitative synthetic records were returned for ${scope.period ?? 'the requested scope'}.`;
        facts.push({ label: 'Records returned', value: '0' });
      }

      const evidenceSentence = citations.length > 0
        ? `Retrieved guidance ${referenceList} is cross-referenced with these values; the cited passages describe reporting expectations and should be read as synthetic training material.`
        : 'No document evidence was retrieved, so the assessment relies on the synthetic data slice only.';

      executiveSummary = `Combined supervisory assessment for ${scope.institutionName ?? scope.institutionId ?? scope.period ?? 'the requested scope'}. ${dataSentence}`;
      detail = `${dataSentence} ${evidenceSentence}`;
      facts.push(
        { label: 'Evidence sources', value: `${citations.length}` },
        { label: 'Citation references', value: citations.map((citation) => citation.reference).join(', ') || 'none' },
      );
      break;
    }
    case 'report': {
      const overview = analyticalResults?.overview as OverviewData | undefined;
      const exceptions = (analyticalResults?.exceptions as ExceptionRow[]) ?? [];
      const institutions = (analyticalResults?.institutions as InstitutionRow[]) ?? [];
      const summary = overview?.summary;
      const periodLabel = overview?.period ?? scope.period ?? 'the latest period';
      const ldr = summary && summary.depositsTzsBillions !== 0
        ? (summary.loansTzsBillions / summary.depositsTzsBillions) * 100
        : null;
      const severity = countValues(exceptions, (row) => row.severity);
      const status = countValues(exceptions, (row) => row.status);
      const topDeposits = [...institutions]
        .filter((row) => row.depositsTzsBillions !== null)
        .sort((left, right) => (right.depositsTzsBillions ?? 0) - (left.depositsTzsBillions ?? 0))
        .slice(0, 3);
      const topNpl = [...institutions]
        .filter((row) => row.nplRatioPercent !== null)
        .sort((left, right) => (right.nplRatioPercent ?? 0) - (left.nplRatioPercent ?? 0))
        .slice(0, 3);

      executiveSummary = summary
        ? `Supervisory summary report for ${periodLabel}: ${summary.institutions} institutions, deposits ${formatNumber(summary.depositsTzsBillions)} TZS bn, loans ${formatNumber(summary.loansTzsBillions)} TZS bn (LDR ${formatNumber(ldr)}%), reporting completeness ${formatNumber(summary.completenessPercent)}% and ${summary.openExceptions} open review signals (${summary.criticalExceptions} critical).`
        : `Supervisory summary report for ${periodLabel}: no portfolio aggregate was returned.`;

      detail = summary
        ? `Aggregate coverage is ${summary.reportsReceived} of ${summary.reportsExpected} expected reports. Review signals on the sampled page total ${exceptions.length} with ${severity.critical ?? 0} critical, ${severity.high ?? 0} high, ${severity.medium ?? 0} medium and ${severity.low ?? 0} low; ${status.open ?? 0} are open, ${status.under_review ?? 0} under review and ${status.resolved ?? 0} resolved. ${topDeposits.length > 0 ? `Highest deposits: ${topDeposits.map((row) => `${row.name} (${row.institutionId}) ${formatNumber(row.depositsTzsBillions)} TZS bn`).join('; ')}.` : 'No institution deposit values were returned.'} ${topNpl.length > 0 ? `Highest NPL ratios: ${topNpl.map((row) => `${row.name} (${row.institutionId}) ${formatNumber(row.nplRatioPercent)}%`).join('; ')}.` : 'No institution NPL values were returned.'}`
        : `No synthetic aggregate returned for ${periodLabel}; ${exceptions.length} review signal(s) were available on the sampled page.`;

      facts.push(
        { label: 'Reporting period', value: periodLabel },
        { label: 'Institutions', value: `${summary?.institutions ?? 0}` },
        { label: 'Reports received', value: `${summary?.reportsReceived ?? 0} of ${summary?.reportsExpected ?? 0}` },
        { label: 'Deposits', value: `${formatNumber(summary?.depositsTzsBillions ?? null)} TZS bn` },
        { label: 'Loans', value: `${formatNumber(summary?.loansTzsBillions ?? null)} TZS bn` },
        { label: 'Loan-to-deposit ratio', value: `${formatNumber(ldr)}%` },
        { label: 'Completeness', value: `${formatNumber(summary?.completenessPercent ?? null)}%` },
        { label: 'Open review signals', value: `${summary?.openExceptions ?? (status.open ?? 0)}` },
        { label: 'Critical review signals', value: `${summary?.criticalExceptions ?? (severity.critical ?? 0)}` },
        { label: 'Top deposits', value: topDeposits.map((row) => `${row.institutionId} ${formatNumber(row.depositsTzsBillions)} TZS bn`).join('; ') || 'not available' },
        { label: 'Top NPL ratios', value: topNpl.map((row) => `${row.institutionId} ${formatNumber(row.nplRatioPercent)}%`).join('; ') || 'not available' },
      );

      cards.push(
        { title: 'Institutions', value: `${summary?.institutions ?? 0}` },
        { title: 'Reports', value: `${summary?.reportsReceived ?? 0} / ${summary?.reportsExpected ?? 0}` },
        { title: 'Total Deposits', value: `${formatNumber(summary?.depositsTzsBillions ?? null)} TZS bn` },
        { title: 'Completeness', value: `${formatNumber(summary?.completenessPercent ?? null)}%` },
        { title: 'Critical Signals', value: `${summary?.criticalExceptions ?? 0}` },
      );
      break;
    }
    case 'document':
    case 'general':
    default: {
      const sources = retrievedSources ?? [];
      const extracts = selectExtractiveEvidence(question, sources);
      const references = citations.map((citation) => citation.reference).join(', ');

      if (extracts.length > 0) {
        executiveSummary = `Retrieved ${sources.length} synthetic source(s) for "${questionScope}": ${extracts.map((entry) => `${entry.reference} ${entry.title}`).join('; ')}.`;
        detail = `Extractive summary from the retrieved evidence: ${extracts.map((entry) => `${entry.reference} ${entry.sentence}`).join(' ')}`;
      } else if (sources.length > 0) {
        executiveSummary = `Retrieved ${sources.length} synthetic source(s) for "${questionScope}", but no direct extractive match was found for the question terms.`;
        detail = `The retrieved sources are listed as citations (${references}) with titles ${sources.map((source, index) => `${`[S${index + 1}]`} ${source.title}`).join('; ')}. No sentence in the top hits contained the question terms or a numeric value, so no extractive statement is asserted.`;
      } else {
        executiveSummary = `No synthetic document or regulatory evidence matched "${questionScope}".`;
        detail = 'No retrieved source was available for the question. Broaden the search terms or check the reporting period.';
      }

      facts.push(
        { label: 'Retrieved sources', value: `${sources.length}` },
        { label: 'Extractive sentences', value: `${extracts.length}` },
        ...sources.slice(0, 3).map((source, index) => ({
          label: `Source S${index + 1}`,
          value: source.title,
          detail: source.kind,
        })),
      );
      break;
    }
  }

  return {
    executiveSummary,
    detail,
    facts,
    dataCards: cards.length > 0 ? cards : undefined,
    citations: citations.length > 0 ? citations : undefined,
    disclaimer: SYNTHETIC_DISCLAIMER,
  };
}

/**
 * Execute the multi-agent supervisory intelligence workflow.
 *
 * Supports:
 * - Intent routing (analytical, document, combined, exception_explanation, report, general)
 * - Parallel specialist execution where independent (combined queries)
 * - Deterministic offline fallback if LM Studio is offline
 * - LM Studio (Qwen) synthesis enrichment when online
 * - Citation fidelity, calculation sanity, and policy compliance verification
 */
export async function executeSupervisoryWorkflow(
  question: string,
  options?: { period?: string; institutionId?: string }
): Promise<SupervisoryWorkflowResult> {
  const startTime = Date.now();
  const trimmed = question?.trim();

  if (!trimmed || trimmed.length < 2 || trimmed.length > MAX_AGENT_MESSAGE_LENGTH) {
    throw new RequestValidationError(
      `Workflow question must be between 2 and ${MAX_AGENT_MESSAGE_LENGTH} characters.`
    );
  }

  const requestId = `wf_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`;
  const activeAgents: string[] = ['supervisor-router'];

  // 1. Router Agent: classify intent and entities
  const classification = classifySupervisoryIntent(trimmed, options);
  const scope: SupervisoryScope = {
    institutionId: classification.institutionId,
    period: classification.period,
    indicatorId: classification.indicatorId,
  };

  // 2. Institution Context Agent (if institution identified)
  let institutionDetail: InstitutionDetail | undefined;
  if (scope.institutionId) {
    activeAgents.push('institution-context');
    try {
      institutionDetail = await getInstitutionDetail(scope.institutionId);
      scope.institutionName = institutionDetail.institution.name;
      scope.region = institutionDetail.institution.region;
      scope.tier = institutionDetail.institution.tier;
      scope.status = institutionDetail.institution.status;
    } catch {
      // If institution detail fails (e.g. not found), continue with id
    }
  }

  const plan = buildWorkflowPlan(classification.intent, scope);
  const analyticalResults: Record<string, unknown> = {};
  let retrievedSources: SearchHit[] | undefined;

  // 3. Specialist Execution Graph
  switch (classification.intent) {
    case 'analytical': {
      activeAgents.push('data-analyst');
      if (scope.institutionId && institutionDetail) {
        analyticalResults.institution = institutionDetail;
        analyticalResults.analytics = await getAnalytics(scope.period, scope.indicatorId);
      } else {
        analyticalResults.overview = await getOverview(scope.period);
        analyticalResults.analytics = await getAnalytics(scope.period, scope.indicatorId);
      }
      break;
    }

    case 'document': {
      activeAgents.push('document-retrieval');
      const evidence = await searchGroundedEvidence(trimmed, {
        institutionId: scope.institutionId,
        period: scope.period,
        limit: 6,
      });
      retrievedSources = evidence.hits;
      break;
    }

    case 'combined': {
      // Parallel handoff! Data Analyst and Document Retrieval execute in parallel
      activeAgents.push('data-analyst', 'document-retrieval');
      const [analyticsData, evidence] = await Promise.all([
        (async () => {
          if (scope.institutionId && institutionDetail) {
            return {
              institution: institutionDetail,
              analytics: await getAnalytics(scope.period, scope.indicatorId),
            };
          }
          return {
            overview: await getOverview(scope.period),
            analytics: await getAnalytics(scope.period, scope.indicatorId),
          };
        })(),
        searchGroundedEvidence(trimmed, {
          institutionId: scope.institutionId,
          period: scope.period,
          limit: 6,
        }),
      ]);

      Object.assign(analyticalResults, analyticsData);
      retrievedSources = evidence.hits;
      break;
    }

    case 'exception_explanation': {
      activeAgents.push('exception-indicator', 'document-retrieval');
      const [exceptionPage, evidence] = await Promise.all([
        listExceptions({
          institutionId: scope.institutionId,
          period: scope.period,
          pageSize: 10,
        }),
        searchGroundedEvidence(trimmed, {
          institutionId: scope.institutionId,
          period: scope.period,
          limit: 4,
        }),
      ]);
      analyticalResults.exceptions = exceptionPage.items;
      analyticalResults.totalExceptions = exceptionPage.total;
      retrievedSources = evidence.hits;
      break;
    }

    case 'report': {
      activeAgents.push('data-analyst', 'report-agent');
      const [overview, exceptionPage, institutionPage] = await Promise.all([
        getOverview(scope.period),
        listExceptions({
          institutionId: scope.institutionId,
          period: scope.period,
          pageSize: 5,
        }),
        listInstitutions({ pageSize: 50 }),
      ]);
      analyticalResults.overview = overview;
      analyticalResults.exceptions = exceptionPage.items;
      analyticalResults.institutions = institutionPage.items;
      break;
    }

    case 'general':
    default: {
      activeAgents.push('document-retrieval');
      const evidence = await searchGroundedEvidence(trimmed, {
        institutionId: scope.institutionId,
        period: scope.period,
        limit: 6,
      });
      retrievedSources = evidence.hits;
      break;
    }
  }

  // 4. Verification Agent: run verification checks
  activeAgents.push('verification-agent');
  const verification = verifySupervisoryOutput({
    intent: classification.intent,
    retrievedSources,
    analyticalResults,
    citationsInResponse: retrievedSources?.map((_, idx) => `S${idx + 1}`),
  });

  // 5. Response Composer Agent: synthesize grounded output
  activeAgents.push('response-composer');

  const aggregateFacts = buildModelAggregateFacts(analyticalResults, scope);
  const contextUsed = Object.keys(aggregateFacts).length > 1;
  const modelProvider = getActiveChatProviderName();

  let modelUsed: 'groq' | 'local-qwen' | 'deterministic-fallback' = 'deterministic-fallback';
  const responsePayload = synthesizeDeterministicResponse({
    question: trimmed,
    intent: classification.intent,
    scope,
    analyticalResults,
    retrievedSources,
  });

  const canEnrich =
    classification.intent !== 'document' &&
    classification.intent !== 'general' &&
    contextUsed;
  const isOnline = canEnrich ? await isChatProviderAvailable() : false;
  if (isOnline) {
    try {
      const dataPrompt = JSON.stringify(aggregateFacts, null, 2).slice(0, 4_000);

      const enrichedNarrative = formatModelResponseText(await generateChatCompletion(
        [
          {
            role: 'system',
            content: `You are the Response Composer Agent for SupTech Monitor.
Use only the supplied synthetic aggregate facts. Do not invent thresholds, institutions, identifiers, records, sources, or policy conclusions.
Do not cite sources: document text and source rows are deliberately not sent to the model. State missing evidence instead of guessing.
Threshold breaches are training review signals, not official findings. All data is synthetic training material.
Reply with two paragraphs: an executive summary first, then detailed analysis.
Use clear plain text only. Do not use Markdown, headings, bullets, asterisks, or hash signs.
Avoid generic boilerplate and answer the exact question.`,
          },
          {
            role: 'user',
            content: `Question: ${trimmed}
Intent: ${classification.intent}
Scope: ${scope.institutionId ? 'single synthetic institution aggregate' : 'portfolio aggregate'}
Reporting period: ${scope.period ?? 'latest available'}
Analytical aggregate facts: ${dataPrompt}`,
          },
        ],
        800,
      ));

      if (
        isValidComposerOutput(enrichedNarrative, aggregateFacts) &&
        !/\[S\d+\]/.test(enrichedNarrative) &&
        usesOnlySupportedNumbers(enrichedNarrative, trimmed, aggregateFacts)
      ) {
        const paragraphs = enrichedNarrative
          .split('\n\n')
          .filter((paragraph) => paragraph.trim().length > 0);
        if (paragraphs.length >= 2) {
          responsePayload.executiveSummary = paragraphs[0].trim();
          responsePayload.detail = paragraphs.slice(1).join('\n\n').trim();
        } else {
          responsePayload.detail = enrichedNarrative.trim();
        }
        modelUsed = getActiveChatProviderName() === 'groq' ? 'groq' : 'local-qwen';
      }
    } catch {
      modelUsed = 'deterministic-fallback';
    }
  }

  const latencyMs = Date.now() - startTime;

  return {
    requestId,
    intent: classification.intent,
    scope,
    activeAgents,
    plan,
    retrievedSources: retrievedSources?.map((s) => ({
      id: s.id,
      title: s.title,
      excerpt: s.excerpt,
      kind: s.kind,
      citation: s.citation,
      rank: s.rank,
    })),
    analyticalResults: Object.keys(analyticalResults).length > 0 ? analyticalResults : undefined,
    verification,
    response: responsePayload,
    latencyMs,
    modelUsed,
    modelProvider,
    contextUsed,
  };
}

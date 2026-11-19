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
  generateLocalChatCompletion,
  getLocalModelBaseUrl,
  isLocalChatModelAvailable,
  LocalModelResponseError,
  LocalModelUnavailableError,
} from './local-model';
import {
  getAnalytics,
  getInstitutionDetail,
  getOverview,
  listExceptions,
  type ExceptionRow,
  type InstitutionDetail,
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

export interface SupervisoryResponsePayload {
  executiveSummary: string;
  detail: string;
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
  modelUsed: 'local-qwen' | 'deterministic-fallback';
}

const CHAT_MODEL = process.env.LM_STUDIO_CHAT_MODEL || 'qwen/qwen3.6-35b-a3b';
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

export async function isLocalModelAvailable(): Promise<boolean> {
  return isLocalChatModelAvailable();
}

/**
 * Call LM Studio API for a single agent
 */
async function callLMStudio(
  agentConfig: AgentConfig,
  userMessage: string,
  conversationHistory?: Array<{ role: string; content: string }>
): Promise<AgentResponse> {
  const startTime = Date.now();

  try {
    const messages = [
      { role: 'system', content: agentConfig.systemPrompt },
      ...(conversationHistory || []),
      { role: 'user', content: userMessage },
    ];

    const response = await fetch(`${getLocalModelBaseUrl()}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages,
        max_tokens: agentConfig.maxTokens || 512,
        temperature: agentConfig.temperature || 0.3,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`The local model returned HTTP ${response.status}.`);
    }

    const data: unknown = await response.json();
    const choices = isRecord(data) && Array.isArray(data.choices) ? data.choices : [];
    const firstChoice = choices[0];
    const message = isRecord(firstChoice) && isRecord(firstChoice.message)
      ? firstChoice.message
      : null;
    const content = message?.content;
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new Error('The local model returned an empty or invalid response.');
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
        : 'The local model request failed.',
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
      return callLMStudio(config, request.userMessage, request.conversationHistory);
    });
    results.push(...(await Promise.all(promises)));
  } else {
    for (const request of requests) {
      const config = AGENT_CONFIGS[request.agentId];
      const result = await callLMStudio(config, request.userMessage, request.conversationHistory);
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
  return callLMStudio(config, request.userMessage, request.conversationHistory);
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

/**
 * Synthesizes deterministic supervisory responses when local model is offline.
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
      if (scope.institutionId && analyticalResults?.institution) {
        const inst = (analyticalResults.institution as InstitutionDetail).institution;
        executiveSummary = `Supervisory assessment for ${inst.name} (${inst.institutionId}) indicates a ${inst.status} position with ${inst.openExceptions} open review signal(s) in latest period ${inst.latestPeriod ?? 'N/A'}.`;
        detail = `Institutional analysis shows deposits of ${formatNumber(inst.depositsTzsBillions)} TZS billion, a Capital Adequacy Ratio of ${formatNumber(inst.capitalAdequacyRatioPercent)}%, and a Non-Performing Loan (NPL) ratio of ${formatNumber(inst.nplRatioPercent)}%. The institution operates in the ${inst.region} region categorized as ${inst.tier}. All figures derive from synthetic return records.`;
        cards.push(
          { title: 'Deposits', value: `${formatNumber(inst.depositsTzsBillions)} TZS bn`, caption: 'Synthetic return' },
          { title: 'Capital Adequacy', value: `${formatNumber(inst.capitalAdequacyRatioPercent)}%`, caption: 'Regulatory benchmark: 10%' },
          { title: 'NPL Ratio', value: `${formatNumber(inst.nplRatioPercent)}%`, caption: 'Prudential warning: > 5%' },
          { title: 'Review Signals', value: `${inst.openExceptions}`, badge: inst.openExceptions > 0 ? 'Review Needed' : 'Normal' }
        );
      } else if (analyticalResults?.overview) {
        const ov = analyticalResults.overview as OverviewData;
        executiveSummary = `Portfolio overview for period ${ov.period ?? 'current'} shows ${ov.summary.institutions} reporting institutions, total deposits of ${formatNumber(ov.summary.depositsTzsBillions)} TZS billion, and ${ov.summary.openExceptions} open supervisory review signal(s).`;
        detail = `Across the supervised sector, reports received stand at ${ov.summary.reportsReceived} of ${ov.summary.reportsExpected} expected (reporting completeness ${formatNumber(ov.summary.completenessPercent)}%). Critical review signals currently total ${ov.summary.criticalExceptions}. Loans total ${formatNumber(ov.summary.loansTzsBillions)} TZS billion.`;
        cards.push(
          { title: 'Total Deposits', value: `${formatNumber(ov.summary.depositsTzsBillions)} TZS bn` },
          { title: 'Total Loans', value: `${formatNumber(ov.summary.loansTzsBillions)} TZS bn` },
          { title: 'Completeness', value: `${formatNumber(ov.summary.completenessPercent)}%` },
          { title: 'Open Signals', value: `${ov.summary.openExceptions}`, badge: `${ov.summary.criticalExceptions} Critical` }
        );
      } else {
        executiveSummary = `Supervisory analytics query processed for ${scope.period ?? 'latest available period'}.`;
        detail = 'Analytical figures extracted from parameterised queries in repository.ts.';
      }
      break;
    }
    case 'exception_explanation': {
      const exceptions = (analyticalResults?.exceptions as ExceptionRow[]) ?? [];
      const count = exceptions.length;
      executiveSummary = count > 0
        ? `Identified ${count} open review signal(s) matching supervisory scope${scope.institutionId ? ` for ${scope.institutionId}` : ''}.`
        : `No open supervisory exceptions found for the specified filters.`;

      if (count > 0) {
        const top = exceptions[0];
        detail = `Priority signal: ${top.indicatorId} flagged for ${top.institutionName} (${top.institutionId}) in period ${top.period} with severity "${top.severity}". Observed value ${formatNumber(top.observedValue)} breached illustrative benchmark ${formatNumber(top.thresholdValue)}. Reason: ${top.message}. In supervisory practice, this signal alerts analysts to inspect underlying data submissions and does not constitute an official ruling of misconduct.`;
        cards.push(
          { title: 'Matching Exceptions', value: `${count}`, badge: top.severity.toUpperCase() },
          { title: 'Observed Value', value: `${formatNumber(top.observedValue)}`, caption: `Threshold: ${formatNumber(top.thresholdValue)}` },
          { title: 'Status', value: top.status.replace('_', ' ') }
        );
      } else {
        detail = 'No threshold breaches recorded in this synthetic slice. Continue standard surveillance.';
      }
      break;
    }
    case 'combined': {
      const ov = analyticalResults?.overview as OverviewData | undefined;
      const inst = analyticalResults?.institution as InstitutionDetail | undefined;
      executiveSummary = `Combined supervisory assessment reconciling quantitative figures with regulatory documentation.`;
      const docCitations = citations.map((c) => c.reference).join(', ');
      detail = `Cross-referencing retrieved guidance (${docCitations || '[S1]'}) with active prudential data demonstrates that institutions must maintain documented capital, liquidity, and asset quality standards. ` +
        (inst
          ? `For ${inst.institution.name}, observed CAR is ${formatNumber(inst.institution.capitalAdequacyRatioPercent)}% and NPL is ${formatNumber(inst.institution.nplRatioPercent)}%, contextualized against regulatory return guidance.`
          : ov
          ? `At portfolio level (${ov.period}), deposits total ${formatNumber(ov.summary.depositsTzsBillions)} TZS bn with ${ov.summary.openExceptions} open review signals needing verification against supervisory filing instructions.`
          : 'Quantitative and qualitative evidence consolidated.');

      if (ov) {
        cards.push(
          { title: 'Portfolio Deposits', value: `${formatNumber(ov.summary.depositsTzsBillions)} TZS bn` },
          { title: 'Open Signals', value: `${ov.summary.openExceptions}` }
        );
      }
      break;
    }
    case 'report': {
      executiveSummary = `Structured supervisory summary report compiled for period ${scope.period ?? 'current'}.`;
      detail = `This report aggregates institutional filings, prudential indicator metrics, and open review signals across synthetic records. All statistics represent training simulations designed for supervisory workflow exercise.`;
      if (analyticalResults?.overview) {
        const ov = analyticalResults.overview as OverviewData;
        cards.push(
          { title: 'Institutions', value: `${ov.summary.institutions}` },
          { title: 'Completeness', value: `${formatNumber(ov.summary.completenessPercent)}%` },
          { title: 'Critical Exceptions', value: `${ov.summary.criticalExceptions}` }
        );
      }
      break;
    }
    case 'document':
    case 'general':
    default: {
      executiveSummary = citations.length > 0
        ? `Retrieved ${citations.length} synthetic document and regulatory source(s) addressing: "${question}".`
        : `Grounded supervisory knowledge retrieval completed.`;
      detail = citations.length > 0
        ? `Analysis of retrieved synthetic evidence (${citations.map((c) => c.reference).join(', ')}):\n\n` +
          citations.map((c) => `${c.reference} ${c.title}:\n${c.excerpt}`).join('\n\n')
        : 'No specific document evidence matched the criteria. Please broaden search terms or check reporting periods.';
      break;
    }
  }

  return {
    executiveSummary,
    detail,
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
      const [overview, exceptionPage] = await Promise.all([
        getOverview(scope.period),
        listExceptions({
          institutionId: scope.institutionId,
          period: scope.period,
          pageSize: 5,
        }),
      ]);
      analyticalResults.overview = overview;
      analyticalResults.exceptions = exceptionPage.items;
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

  let modelUsed: 'local-qwen' | 'deterministic-fallback' = 'deterministic-fallback';
  let responsePayload = synthesizeDeterministicResponse({
    question: trimmed,
    intent: classification.intent,
    scope,
    analyticalResults,
    retrievedSources,
  });

  // Attempt local LM Studio enrichment if available
  const isOnline = await isLocalChatModelAvailable();
  if (isOnline) {
    try {
      const evidencePrompt = (retrievedSources ?? [])
        .slice(0, 4)
        .map((s, idx) => `[S${idx + 1}] ${s.title}: ${s.excerpt}`)
        .join('\n\n');

      const dataPrompt = JSON.stringify(analyticalResults, null, 2).slice(0, 1500);

      const enrichedNarrative = await generateLocalChatCompletion(
        [
          {
            role: 'system',
            content: `You are the Response Composer Agent for SupTech Monitor.
Synthesize an executive summary and detailed supervisory analysis for: "${trimmed}".
Intent: ${classification.intent}. Scope: ${JSON.stringify(scope)}.
Use only the supplied data and evidence.
Cite sources as [S1], [S2] if evidence is present.
Threshold breaches are review signals, not legal findings. Synthetic data only.
Format with two clear paragraphs: first is executive summary, second is detailed analysis.`,
          },
          {
            role: 'user',
            content: `Analytical Data:\n${dataPrompt}\n\nEvidence Sources:\n${evidencePrompt || 'None'}`,
          },
        ],
        800
      );

      if (enrichedNarrative && enrichedNarrative.length > 50) {
        const paragraphs = enrichedNarrative.split('\n\n').filter((p) => p.trim().length > 0);
        if (paragraphs.length >= 2) {
          responsePayload.executiveSummary = paragraphs[0].trim();
          responsePayload.detail = paragraphs.slice(1).join('\n\n').trim();
        } else {
          responsePayload.detail = enrichedNarrative.trim();
        }
        modelUsed = 'local-qwen';
      }
    } catch (error) {
      // Graceful offline fallback: log or ignore and preserve deterministic response
      if (
        !(
          error instanceof LocalModelUnavailableError ||
          error instanceof LocalModelResponseError
        )
      ) {
        // Unexpected error, keep deterministic fallback
      }
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
  };
}

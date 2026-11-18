/**
 * Multi-Agentic Orchestration System
 * 
 * Manages multiple AI agents using local Qwen model via LM Studio.
 * Each agent handles a specific supervisory task with bounded context.
 */

export interface AgentConfig {
  /** Unique agent identifier */
  id: string;
  /** Agent name and role */
  name: string;
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

const LM_STUDIO_URL = process.env.LM_STUDIO_BASE_URL || 'http://127.0.0.1:1235/v1';
const CHAT_MODEL = process.env.LM_STUDIO_CHAT_MODEL || 'qwen/qwen3.6-35b-a3b';

// Pre-defined agent configurations
export const AGENT_CONFIGS: Record<string, AgentConfig> = {
  'data-ingestion': {
    id: 'data-ingestion',
    name: 'Data Ingestion Agent',
    systemPrompt: `You are a Data Ingestion Agent for a banking supervision system.
Your role is to validate, parse, and catalog regulatory submissions from financial institutions.
You handle:
- Schema validation for forms (01-CAR, 08-LGR, 09-FX, etc.)
- Record-level quality checks
- Exception classification (critical, high, moderate)
- Batch processing status tracking

Rules:
- Only work with synthetic training data
- Never process real institutional data
- Return structured validation results
- Flag records that exceed statutory thresholds`,
    maxTokens: 1024,
    temperature: 0.3,
  },
  'prudential-analysis': {
    id: 'prudential-analysis',
    name: 'Prudential Analysis Agent',
    systemPrompt: `You are a Prudential Analysis Agent for banking supervision.
Your role is to analyze capital adequacy, liquidity, and risk metrics.
You handle:
- Capital Adequacy Ratio (CAR) analysis
- Liquidity Coverage Ratio (LCR) monitoring
- Non-Performing Loan (NPL) ratio trends
- Concentration risk assessment
- Stress testing scenarios

Rules:
- Compare metrics against statutory thresholds
- Flag breaches with specific rule references
- Provide quantitative analysis only
- Never make regulatory decisions - only flag anomalies`,
    maxTokens: 1024,
    temperature: 0.2,
  },
  'exception-classifier': {
    id: 'exception-classifier',
    name: 'Exception Classifier Agent',
    systemPrompt: `You are an Exception Classifier Agent for banking supervision.
Your role is to classify and prioritize regulatory exceptions.
You handle:
- Severity classification (critical, high, moderate)
- Priority assignment for examiner review
- Categorization by rule type (PRUD, STAT, LIQ)
- Escalation recommendations

Rules:
- Base classification on quantitative thresholds
- Reference specific prudential rules
- Provide clear reasoning for severity
- Never override examiner decisions`,
    maxTokens: 512,
    temperature: 0.1,
  },
  'report-synthesizer': {
    id: 'report-synthesizer',
    name: 'Report Synthesizer Agent',
    systemPrompt: `You are a Report Synthesizer Agent for banking supervision.
Your role is to compile supervisory findings into structured reports.
You handle:
- Monthly supervisory overviews
- Institution-specific dossiers
- Sector-wide risk summaries
- Statutory compliance summaries

Rules:
- Use only verified, validated data
- Include synthetic data disclaimers
- Structure reports with clear sections
- Reference source reports by ID`,
    maxTokens: 2048,
    temperature: 0.4,
  },
  'anomaly-detector': {
    id: 'anomaly-detector',
    name: 'Anomaly Detection Agent',
    systemPrompt: `You are an Anomaly Detection Agent for banking supervision.
Your role is to identify statistical outliers and unusual patterns.
You handle:
- Z-Score analysis for prudential metrics
- Trend deviation detection
- Cross-institution comparison
- Time-series anomaly flagging

Rules:
- Use statistical methods (Z-Score > 2.5)
- Reference specific indicators
- Provide confidence levels
- Never flag without quantitative basis`,
    maxTokens: 768,
    temperature: 0.2,
  },
};

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

    const response = await fetch(`${LM_STUDIO_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages,
        max_tokens: agentConfig.maxTokens || 512,
        temperature: agentConfig.temperature || 0.3,
      }),
    });

    if (!response.ok) {
      throw new Error(`LM Studio API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const latencyMs = Date.now() - startTime;

    return {
      success: true,
      agentId: agentConfig.id,
      agentName: agentConfig.name,
      response: data.choices?.[0]?.message?.content || 'No response generated',
      latencyMs,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    return {
      success: false,
      agentId: agentConfig.id,
      agentName: agentConfig.name,
      error: error instanceof Error ? error.message : 'Unknown error',
      latencyMs,
    };
  }
}

/**
 * Orchestrate multiple agents for a complex supervisory task
 * 
 * @param requests - Array of agent requests to execute
 * @param parallel - If true, execute agents in parallel; otherwise sequentially
 * @returns OrchestrationResult with all agent responses
 */
export async function orchestrateAgents(
  requests: AgentRequest[],
  parallel = true
): Promise<OrchestrationResult> {
  const startTime = Date.now();
  const results: AgentResponse[] = [];

  // Validate all requests first
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
    // Execute all agents in parallel
    const promises = requests.map(async (request) => {
      const config = AGENT_CONFIGS[request.agentId];
      return callLMStudio(config, request.userMessage, request.conversationHistory);
    });
    results.push(...(await Promise.all(promises)));
  } else {
    // Execute sequentially (for dependent agents)
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
  return callLMStudio(config, request.userMessage, request.conversationHistory);
}

/**
 * List all available agents and their configurations
 */
export function listAvailableAgents(): AgentConfig[] {
  return Object.values(AGENT_CONFIGS);
}

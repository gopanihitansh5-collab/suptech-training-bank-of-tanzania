/**
 * Multi-Agentic Orchestration System
 * 
 * Manages multiple AI agents using local Qwen model via LM Studio.
 * Each agent handles a specific supervisory task with bounded context.
 */
import { getLocalModelBaseUrl, isLocalChatModelAvailable } from './local-model';

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

const CHAT_MODEL = process.env.LM_STUDIO_CHAT_MODEL || 'qwen/qwen3.6-35b-a3b';
export const MAX_AGENT_REQUESTS = 5;
export const MAX_AGENT_MESSAGE_LENGTH = 2000;

export const AGENT_CONFIGS: Record<string, AgentConfig> = {
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
 * 
 * @param requests - Array of agent requests to execute
 * @param parallel - If true, execute agents in parallel; otherwise sequentially
 * @returns OrchestrationResult with all agent responses
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

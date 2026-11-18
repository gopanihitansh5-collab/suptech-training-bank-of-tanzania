import { NextResponse } from 'next/server';
import { errorResponse, readJsonBody, RequestValidationError } from '@/lib/api-errors';
import { requireDemoSession } from '@/lib/auth';
import {
  AGENT_CONFIGS,
  MAX_AGENT_MESSAGE_LENGTH,
  MAX_AGENT_REQUESTS,
  orchestrateAgents,
  listAvailableAgents,
  type AgentRequest,
} from '@/lib/orchestration';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRequests(value: unknown): AgentRequest[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_AGENT_REQUESTS) {
    throw new RequestValidationError(
      `Select between 1 and ${MAX_AGENT_REQUESTS} analysis roles.`,
    );
  }

  const seen = new Set<string>();
  return value.map((entry) => {
    if (!isRecord(entry)) {
      throw new RequestValidationError('Each analysis request must be an object.');
    }

    const { agentId, userMessage, conversationHistory } = entry;
    if (typeof agentId !== 'string' || !Object.hasOwn(AGENT_CONFIGS, agentId)) {
      throw new RequestValidationError('Each request must select an available analysis role.');
    }
    if (seen.has(agentId)) {
      throw new RequestValidationError('An analysis role can only be selected once.');
    }
    seen.add(agentId);

    if (
      typeof userMessage !== 'string' ||
      userMessage.trim().length < 2 ||
      userMessage.length > MAX_AGENT_MESSAGE_LENGTH
    ) {
      throw new RequestValidationError(
        `Each prompt must contain 2-${MAX_AGENT_MESSAGE_LENGTH} characters.`,
      );
    }

    if (conversationHistory !== undefined) {
      throw new RequestValidationError('Conversation history is not supported by this workspace.');
    }

    return { agentId, userMessage: userMessage.trim() };
  });
}

export async function POST(request: Request) {
  try {
    await requireDemoSession();
    const body = await readJsonBody(request, 32_000);
    if (!isRecord(body)) {
      throw new RequestValidationError('The request body must be an object.');
    }
    const parallel = body.parallel ?? true;
    if (typeof parallel !== 'boolean') {
      throw new RequestValidationError('Execution mode must be parallel or sequential.');
    }

    const result = await orchestrateAgents(parseRequests(body.requests), parallel);
    return NextResponse.json(result, { status: result.success ? 200 : 502 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET() {
  try {
    await requireDemoSession();
    const agents = listAvailableAgents().map(({ id, name, description }) => ({
      id,
      name,
      description,
    }));
    return NextResponse.json({ agents });
  } catch (error) {
    return errorResponse(error);
  }
}

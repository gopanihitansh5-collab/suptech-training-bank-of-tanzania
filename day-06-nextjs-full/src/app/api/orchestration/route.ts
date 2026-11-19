import { metric } from '@vercel/functions';
import { NextResponse } from 'next/server';
import { errorResponse, readJsonBody, RequestValidationError } from '@/lib/api-errors';
import { requireDemoSession } from '@/lib/auth';
import { getActiveChatProviderName } from '@/lib/model-provider';
import {
  AGENT_CONFIGS,
  executeSupervisoryWorkflow,
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
  const startedAt = performance.now();
  let outcome: 'success' | 'rejected' | 'denied' | 'error' = 'error';
  let mode = 'unknown';
  const provider = getActiveChatProviderName();
  try {
    await requireDemoSession();
    const body = await readJsonBody(request, 32_000);
    if (!isRecord(body)) {
      throw new RequestValidationError('The request body must be an object.');
    }
    if (body.syntheticOnlyConfirmed !== true) {
      throw new RequestValidationError(
        'Confirm that the question and dashboard use synthetic training data only.',
      );
    }

    // Workflow Mode
    if (body.workflow === true) {
      mode = 'workflow';
      if (
        typeof body.question !== 'string' ||
        body.question.trim().length < 2 ||
        body.question.length > MAX_AGENT_MESSAGE_LENGTH
      ) {
        throw new RequestValidationError(
          `Workflow question must contain 2-${MAX_AGENT_MESSAGE_LENGTH} characters.`,
        );
      }

      let period: string | undefined;
      if (typeof body.period === 'string' && body.period.trim().length > 0) {
        const trimmedPeriod = body.period.trim();
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(trimmedPeriod)) {
          throw new RequestValidationError('period must use YYYY-MM format.');
        }
        period = trimmedPeriod;
      }

      let institutionId: string | undefined;
      if (typeof body.institutionId === 'string' && body.institutionId.trim().length > 0) {
        const trimmedInst = body.institutionId.trim();
        if (!/^[A-Za-z0-9-]{2,24}$/.test(trimmedInst)) {
          throw new RequestValidationError('institutionId has an invalid format.');
        }
        institutionId = trimmedInst.toUpperCase();
      }

      const workflowResult = await executeSupervisoryWorkflow(body.question.trim(), {
        period,
        institutionId,
      });
      outcome = 'success';
      const response = NextResponse.json(workflowResult, { status: 200 });
      response.headers.set('Cache-Control', 'private, no-store, max-age=0');
      return response;
    }

    // Existing Multi-Role Manual Prompt Mode
    mode = 'direct';
    const parallel = body.parallel ?? true;
    if (typeof parallel !== 'boolean') {
      throw new RequestValidationError('Execution mode must be parallel or sequential.');
    }

    const result = await orchestrateAgents(parseRequests(body.requests), parallel);
    outcome = result.success ? 'success' : 'error';
    const response = NextResponse.json(result, { status: result.success ? 200 : 502 });
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    return response;
  } catch (error) {
    const response = errorResponse(error);
    outcome = response.status === 401 || response.status === 403
      ? 'denied'
      : response.status < 500
        ? 'rejected'
        : 'error';
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    return response;
  } finally {
    metric('agent_orchestration.completed', 1, { outcome, mode, provider });
    metric('agent_orchestration.duration_ms', performance.now() - startedAt, {
      outcome,
      mode,
      provider,
    });
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

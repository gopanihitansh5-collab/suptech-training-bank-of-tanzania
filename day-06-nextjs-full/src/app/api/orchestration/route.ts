import { NextResponse } from 'next/server';
import { orchestrateAgents, executeAgent, listAvailableAgents } from '@/lib/orchestration';
import { requireDemoSession } from '@/lib/auth';

/**
 * POST /api/orchestration
 * Execute one or more agents (parallel or sequential)
 */
export async function POST(request: Request) {
  try {
    await requireDemoSession();
  } catch (error) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  let body: {
    requests?: Array<{
      agentId: string;
      userMessage: string;
      conversationHistory?: Array<{ role: string; content: string }>;
    }>;
    parallel?: boolean;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const { requests, parallel = true } = body;

  if (!requests || !Array.isArray(requests) || requests.length === 0) {
    return NextResponse.json(
      { error: 'requests must be a non-empty array' },
      { status: 400 }
    );
  }

  // Validate each request has required fields
  for (const req of requests) {
    if (!req.agentId || typeof req.agentId !== 'string') {
      return NextResponse.json(
        { error: `Each request must have a valid agentId string` },
        { status: 400 }
      );
    }
    if (!req.userMessage || typeof req.userMessage !== 'string') {
      return NextResponse.json(
        { error: `Each request must have a valid userMessage string` },
        { status: 400 }
      );
    }
  }

  const result = await orchestrateAgents(
    requests.map((r) => ({
      agentId: r.agentId,
      userMessage: r.userMessage,
      conversationHistory: r.conversationHistory,
    })),
    parallel
  );

  if (!result.success) {
    return NextResponse.json(
      { error: result.error, agents: result.agents },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    agents: result.agents,
    totalLatencyMs: result.totalLatencyMs,
  });
}

/**
 * GET /api/orchestration
 * List all available agents
 */
export async function GET(request: Request) {
  try {
    await requireDemoSession();
  } catch (error) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  const agents = listAvailableAgents();
  return NextResponse.json({ agents });
}

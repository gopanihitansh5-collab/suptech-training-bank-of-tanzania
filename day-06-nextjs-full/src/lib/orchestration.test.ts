import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AGENT_CONFIGS,
  executeAgent,
  isLocalModelAvailable,
  listAvailableAgents,
  orchestrateAgents,
} from './orchestration';

function modelResponse(content: string): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content } }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

describe('local model orchestration', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.stubEnv('LM_STUDIO_BASE_URL', 'http://127.0.0.1:1235/v1');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('lists every configured role with its UI description', () => {
    const agents = listAvailableAgents();
    expect(agents).toHaveLength(Object.keys(AGENT_CONFIGS).length);
    expect(agents.every((agent) => agent.description.length > 0)).toBe(true);
  });

  it('rejects unknown agents without calling the model', async () => {
    const result = await executeAgent({
      agentId: 'unknown-agent',
      userMessage: 'Explain this synthetic example.',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown agent ID');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends valid work to the configured loopback model and returns its response', async () => {
    vi.mocked(fetch).mockResolvedValue(modelResponse('Synthetic data only.'));

    const result = await executeAgent({
      agentId: 'data-ingestion',
      userMessage: 'Explain this synthetic example.',
    });

    expect(result).toMatchObject({
      success: true,
      agentId: 'data-ingestion',
      agentName: 'Data Ingestion Agent',
      response: 'Synthetic data only.',
    });
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:1235/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('rejects non-loopback model endpoints without sending data', async () => {
    vi.stubEnv('LM_STUDIO_BASE_URL', 'https://models.example.com/v1');

    const result = await executeAgent({
      agentId: 'data-ingestion',
      userMessage: 'Explain this synthetic example.',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('loopback');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns an explicit failure for an empty model response', async () => {
    vi.mocked(fetch).mockResolvedValue(modelResponse('  '));

    const result = await executeAgent({
      agentId: 'data-ingestion',
      userMessage: 'Explain this synthetic example.',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('empty or invalid response');
  });

  it('checks model readiness through the loopback models endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 'qwen/qwen3.6-35b-a3b' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(isLocalModelAvailable()).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:1235/v1/models',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('validates empty, oversized and duplicate agent requests before model calls', async () => {
    const empty = await orchestrateAgents([]);
    const tooLong = await orchestrateAgents([{
      agentId: 'data-ingestion',
      userMessage: 'x'.repeat(2001),
    }]);
    const duplicate = await orchestrateAgents([
      { agentId: 'data-ingestion', userMessage: 'first task' },
      { agentId: 'data-ingestion', userMessage: 'second task' },
    ]);

    expect(empty.error).toContain('at least one');
    expect(tooLong.error).toContain('2-2000');
    expect(duplicate.error).toContain('only be selected once');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('runs valid selected roles in parallel and returns each result', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(modelResponse('First role response.'))
      .mockResolvedValueOnce(modelResponse('Second role response.'));

    const result = await orchestrateAgents([
      { agentId: 'data-ingestion', userMessage: 'Validate this fictional sample.' },
      { agentId: 'prudential-analysis', userMessage: 'Explain this synthetic ratio.' },
    ]);

    expect(result.success).toBe(true);
    expect(result.agents.map((agent) => agent.response)).toEqual([
      'First role response.',
      'Second role response.',
    ]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

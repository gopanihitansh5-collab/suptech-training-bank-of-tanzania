import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ModelProviderResponseError,
  ModelProviderUnavailableError,
  clearChatProviderAvailabilityCache,
  generateChatCompletion,
  getActiveChatProviderName,
  getChatModelId,
  getProviderStatus,
  isChatProviderAvailable,
} from './model-provider';

const messages = [
  { role: 'system' as const, content: 'Use only supplied evidence.' },
  { role: 'user' as const, content: 'Summarize the synthetic portfolio.' },
];

function chatResponse(content: string): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content } }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function modelsResponse(ids: string[] = ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile']): Response {
  return new Response(
    JSON.stringify({ data: ids.map((id) => ({ id })) }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function isModelsRequest(url: unknown): boolean {
  return typeof url === 'string' && url.endsWith('/models');
}

function modelFromInit(init: RequestInit | undefined): string {
  return JSON.parse(String(init?.body)).model;
}

beforeEach(() => {
  vi.stubEnv('MODEL_PROVIDER', 'lmstudio');
  vi.stubEnv('GROQ_API_KEY', '');
  vi.stubEnv('GROQ_BASE_URL', 'https://api.groq.com/openai/v1');
  vi.stubEnv('GROQ_TIMEOUT_MS', '30000');
  vi.stubEnv('LM_STUDIO_BASE_URL', 'http://127.0.0.1:1235/v1');
  clearChatProviderAvailabilityCache();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('chat provider selection', () => {
  it('keeps an explicitly selected Groq provider visible when its key is missing', () => {
    expect(getActiveChatProviderName()).toBe('lmstudio');

    vi.stubEnv('MODEL_PROVIDER', 'groq');
    expect(getActiveChatProviderName()).toBe('groq');
    expect(getProviderStatus().configured).toBe(false);

    vi.stubEnv('GROQ_API_KEY', 'test-key');
    expect(getActiveChatProviderName()).toBe('groq');
    expect(getChatModelId()).toBe('openai/gpt-oss-120b');
  });

  it('returns safe provider status without secrets', () => {
    vi.stubEnv('MODEL_PROVIDER', 'groq');
    vi.stubEnv('GROQ_API_KEY', 'super-secret-key');

    const status = getProviderStatus();
    expect(status).toEqual({
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
      baseUrl: 'https://api.groq.com/openai/v1',
      configured: true,
    });
    expect(JSON.stringify(status)).not.toContain('super-secret-key');
  });
});

describe('Groq chat completions', () => {
  beforeEach(() => {
    vi.stubEnv('MODEL_PROVIDER', 'groq');
    vi.stubEnv('GROQ_API_KEY', 'test-groq-key');
  });

  it('discovers free models, then posts to the fastest candidate with Bearer auth', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) =>
      isModelsRequest(url) ? modelsResponse() : chatResponse('Grounded answer.'),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateChatCompletion(messages, 500)).resolves.toBe('Grounded answer.');

    const chatCalls = fetchMock.mock.calls.filter(([url]) => !isModelsRequest(url));
    expect(chatCalls).toHaveLength(1);
    const [url, options] = chatCalls[0];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(options.headers.Authorization).toBe('Bearer test-groq-key');
    const body = JSON.parse(options.body);
    expect(body).toMatchObject({
      model: 'openai/gpt-oss-120b',
      max_tokens: 500,
      temperature: 0.1,
      messages,
    });
  });

  it('allows an explicitly configured HTTPS host', async () => {
    vi.stubEnv('GROQ_BASE_URL', 'https://gateway.example.com/v1');
    const fetchMock = vi.fn().mockImplementation(async (url: string) =>
      isModelsRequest(url) ? modelsResponse() : chatResponse('Hosted answer.'),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateChatCompletion(messages)).resolves.toBe('Hosted answer.');
    expect(
      fetchMock.mock.calls.some(
        ([url]) => url === 'https://gateway.example.com/v1/chat/completions',
      ),
    ).toBe(true);
  });

  it('rejects non-HTTPS and credentialed base URLs before sending data', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    vi.stubEnv('GROQ_BASE_URL', 'http://api.groq.com/openai/v1');
    await expect(generateChatCompletion(messages)).rejects.toBeInstanceOf(
      ModelProviderUnavailableError,
    );

    vi.stubEnv('GROQ_BASE_URL', 'https://user:pass@api.groq.com/openai/v1');
    await expect(generateChatCompletion(messages)).rejects.toBeInstanceOf(
      ModelProviderUnavailableError,
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to the next free model on a model-selection error', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (isModelsRequest(url)) {
        return modelsResponse(['openai/gpt-oss-120b', 'llama-3.3-70b-versatile']);
      }
      return modelFromInit(init) === 'openai/gpt-oss-120b'
        ? new Response('model not found', { status: 404 })
        : chatResponse('Fallback answer.');
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateChatCompletion(messages, 400)).resolves.toBe('Fallback answer.');

    const attemptedModels = fetchMock.mock.calls
      .filter(([url]) => !isModelsRequest(url))
      .map(([, init]) => modelFromInit(init));
    expect(attemptedModels).toEqual([
      'openai/gpt-oss-120b',
      'llama-3.3-70b-versatile',
    ]);
  });

  it('falls through rate-limited and failing free models to the next candidate', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (isModelsRequest(url)) {
        return modelsResponse([
          'openai/gpt-oss-120b',
          'llama-3.3-70b-versatile',
          'llama-3.1-8b-instant',
        ]);
      }
      const model = modelFromInit(init);
      if (model === 'openai/gpt-oss-120b') {
        return new Response('rate limited', { status: 429 });
      }
      if (model === 'llama-3.3-70b-versatile') {
        return new Response('upstream error', { status: 503 });
      }
      return chatResponse('Third model answer.');
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateChatCompletion(messages)).resolves.toBe('Third model answer.');

    const attemptedModels = fetchMock.mock.calls
      .filter(([url]) => !isModelsRequest(url))
      .map(([, init]) => modelFromInit(init));
    expect(attemptedModels).toEqual([
      'openai/gpt-oss-120b',
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
    ]);
  });

  it('ranks measured models by lowest observed latency on later requests', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (isModelsRequest(url)) {
        return modelsResponse(['openai/gpt-oss-120b', 'llama-3.1-8b-instant']);
      }
      return chatResponse(`answer from ${modelFromInit(init)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await generateChatCompletion(messages);
    await generateChatCompletion(messages);

    const secondRequestModels = fetchMock.mock.calls
      .filter(([url]) => !isModelsRequest(url))
      .slice(1)
      .map(([, init]) => modelFromInit(init));
    expect(secondRequestModels).toEqual(['openai/gpt-oss-120b']);
  });

  it('throws a safe unavailable error when every free model is rate limited', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (isModelsRequest(url)) return modelsResponse();
      return new Response('rate limited by upstream', { status: 429 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const error = await generateChatCompletion(messages).catch((failure) => failure);
    expect(error).toBeInstanceOf(ModelProviderUnavailableError);
    expect(error.message).toContain('temporarily unavailable');
    expect(error.message).toContain('free chat models');
    expect(error.message).not.toContain('test-groq-key');
    expect(
      fetchMock.mock.calls.filter(([url]) => !isModelsRequest(url)).length,
    ).toBeGreaterThan(1);
  });

  it('throws a response error for malformed model output', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) =>
        isModelsRequest(url) ? modelsResponse() : chatResponse('   '),
      ),
    );
    await expect(generateChatCompletion(messages)).rejects.toBeInstanceOf(
      ModelProviderResponseError,
    );
  });
});

describe('request validation', () => {
  it('enforces message counts, lengths and token limits', async () => {
    await expect(generateChatCompletion([messages[0]])).rejects.toBeInstanceOf(RangeError);
    await expect(generateChatCompletion(messages, 0)).rejects.toBeInstanceOf(RangeError);
    await expect(generateChatCompletion(messages, 1201)).rejects.toBeInstanceOf(RangeError);
    await expect(
      generateChatCompletion([
        messages[0],
        { role: 'user', content: 'x'.repeat(10_001) },
      ]),
    ).rejects.toBeInstanceOf(RangeError);
  });
});

describe('LM Studio chat completions', () => {
  it('uses the loopback chat endpoint without credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(chatResponse('Local answer.'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateChatCompletion(messages)).resolves.toBe('Local answer.');
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:1235/v1/chat/completions');
    expect(options.headers.Authorization).toBeUndefined();
  });

  it('rejects non-loopback LM Studio endpoints', async () => {
    vi.stubEnv('LM_STUDIO_BASE_URL', 'https://models.example.com/v1');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateChatCompletion(messages)).rejects.toBeInstanceOf(
      ModelProviderUnavailableError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('provider availability', () => {
  it('probes the LM Studio models endpoint and caches the result', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => modelsResponse());
    vi.stubGlobal('fetch', fetchMock);

    await expect(isChatProviderAvailable()).resolves.toBe(true);
    await expect(isChatProviderAvailable()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await expect(isChatProviderAvailable({ bypassCache: true })).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('probes Groq with Bearer auth and caches per provider', async () => {
    vi.stubEnv('MODEL_PROVIDER', 'groq');
    vi.stubEnv('GROQ_API_KEY', 'test-groq-key');
    const fetchMock = vi.fn().mockResolvedValue(modelsResponse());
    vi.stubGlobal('fetch', fetchMock);

    await expect(isChatProviderAvailable()).resolves.toBe(true);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.groq.com/openai/v1/models');
    expect(options.headers.Authorization).toBe('Bearer test-groq-key');
  });

  it('returns false when the provider cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(isChatProviderAvailable({ bypassCache: true })).resolves.toBe(false);
  });
});

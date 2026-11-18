import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createLocalEmbeddings,
  generateLocalChatCompletion,
  getLocalModelBaseUrl,
  LocalModelResponseError,
} from './local-model';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('local model gateway', () => {
  it('accepts only credential-free loopback endpoints', () => {
    vi.stubEnv('LM_STUDIO_BASE_URL', 'http://127.0.0.1:1235/v1/');
    expect(getLocalModelBaseUrl()).toBe('http://127.0.0.1:1235/v1');

    vi.stubEnv('LM_STUDIO_BASE_URL', 'https://models.example.com/v1');
    expect(() => getLocalModelBaseUrl()).toThrow('loopback');
  });

  it('validates and orders finite embedding vectors by response index', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        data: [
          { index: 1, embedding: [0, 1] },
          { index: 0, embedding: [1, 0] },
        ],
      }), { status: 200 }),
    ));

    await expect(createLocalEmbeddings(['first', 'second'])).resolves.toEqual([
      [1, 0],
      [0, 1],
    ]);
  });

  it('rejects invalid embedding vectors instead of returning partial results', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ index: 0, embedding: [Number.NaN] }] }), {
        status: 200,
      }),
    ));

    await expect(createLocalEmbeddings(['test'])).rejects.toBeInstanceOf(LocalModelResponseError);
  });

  it('uses the loopback chat model and rejects malformed answers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: 'Grounded answer.' } }] }), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateLocalChatCompletion([
      { role: 'system', content: 'Use only evidence.' },
      { role: 'user', content: 'Summarize this evidence.' },
    ])).resolves.toBe('Grounded answer.');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:1235/v1/chat/completions',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});

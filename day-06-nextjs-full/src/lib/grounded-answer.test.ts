import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { answerFromEvidence } from './grounded-answer';

beforeEach(() => {
  vi.stubEnv('MODEL_PROVIDER', 'lmstudio');
  vi.stubEnv('LM_STUDIO_BASE_URL', 'http://127.0.0.1:1235/v1');
  vi.stubEnv('GROQ_API_KEY', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const source = {
  kind: 'report' as const,
  id: 'R-1',
  title: 'Synthetic monthly report',
  excerpt: 'NPL ratio 4.2% for 2026-10.',
  citation: { reportId: 'R-1', institutionId: 'TZ001', period: '2026-10' },
  rank: 0.02,
};

function answerResponse(content: string): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content } }] }),
    { status: 200 },
  );
}

describe('grounded answer validation', () => {
  it('does not call the model when retrieval returns no evidence', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(answerFromEvidence('What is the NPL ratio?', [])).resolves.toMatchObject({
      status: 'no_evidence',
      mode: 'unavailable',
      citations: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns validated model citations when the answer cites retrieved source IDs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      answerResponse('The reported NPL ratio is 4.2% [S1].'),
    ));

    await expect(answerFromEvidence('What is the NPL ratio?', [source])).resolves.toMatchObject({
      status: 'answered',
      mode: 'model',
      citations: [{ sourceId: 'S1', citation: { reportId: 'R-1' } }],
    });
  });

  it('falls back to an extractive answer when the model cites an unknown source', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      answerResponse('The ratio is 4.2% [S9].'),
    ));

    const result = await answerFromEvidence('What is the NPL ratio?', [source]);
    expect(result).toMatchObject({
      status: 'answered',
      mode: 'extractive',
      citations: [{ sourceId: 'S1' }],
      error: expect.stringContaining('not retrieved'),
    });
    expect(result.text).toContain('[S1]');
    expect(result.text).toContain('4.2%');
  });

  it('returns an extractive answer when the model is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const result = await answerFromEvidence('What is the NPL ratio?', [source]);
    expect(result.status).toBe('answered');
    expect(result.mode).toBe('extractive');
    expect(result.text).toContain('[S1]');
    expect(result.citations).toEqual([
      {
        sourceId: 'S1',
        title: source.title,
        kind: source.kind,
        citation: source.citation,
      },
    ]);
  });

  it('returns unavailable when neither the model nor extractive matching works', async () => {
    const unhelpful = {
      ...source,
      id: 'R-2',
      excerpt: 'This document has no useful details for the requested topic.',
    };
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const result = await answerFromEvidence('What is the capital ratio?', [unhelpful]);
    expect(result.status).toBe('unavailable');
    expect(result.mode).toBe('unavailable');
    expect(result.citations[0].sourceId).toBe('S1');
  });
});

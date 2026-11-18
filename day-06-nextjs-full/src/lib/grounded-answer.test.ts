import { afterEach, describe, expect, it, vi } from 'vitest';
import { answerFromEvidence } from './grounded-answer';

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

describe('grounded answer validation', () => {
  it('does not call the model when retrieval returns no evidence', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(answerFromEvidence('What is the NPL ratio?', [])).resolves.toMatchObject({
      status: 'no_evidence',
      citations: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns citations only when the local answer cites retrieved source IDs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        choices: [{ message: { content: 'The reported ratio is 4.2% [S1].' } }],
      }), { status: 200 }),
    ));

    await expect(answerFromEvidence('What is the NPL ratio?', [source])).resolves.toMatchObject({
      status: 'answered',
      citations: [{ sourceId: 'S1', citation: { reportId: 'R-1' } }],
    });
  });

  it('withholds uncited or fabricated citations and keeps source evidence visible', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        choices: [{ message: { content: 'The ratio is 4.2% [S9].' } }],
      }), { status: 200 }),
    ));

    await expect(answerFromEvidence('What is the NPL ratio?', [source])).resolves.toMatchObject({
      status: 'unavailable',
      citations: [{ sourceId: 'S1' }],
      error: expect.stringContaining('not retrieved'),
    });
  });
});

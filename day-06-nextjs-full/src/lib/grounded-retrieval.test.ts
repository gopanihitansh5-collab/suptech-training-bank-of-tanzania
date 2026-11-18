import { describe, expect, it } from 'vitest';
import { cosineSimilarity, reciprocalRankFuse } from './grounded-retrieval';

describe('grounded retrieval ranking', () => {
  it('computes cosine similarity and safely handles mismatched vectors', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([1], [1, 0])).toBe(0);
  });

  it('fuses semantic and keyword ranks while deduplicating the same source', () => {
    const lexical = [{
      kind: 'report' as const,
      id: 'R-1',
      title: 'Synthetic report',
      excerpt: 'keyword evidence',
      citation: { reportId: 'R-1' },
      rank: 0,
    }];
    const semantic = [
      {
        ...lexical[0],
        excerpt: 'semantic evidence',
      },
      {
        kind: 'exception' as const,
        id: 'E-1',
        title: 'Review signal',
        excerpt: 'semantic match',
        citation: { exceptionId: 'E-1' },
        rank: 0,
      },
    ];

    const result = reciprocalRankFuse([lexical, semantic], 5);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      kind: 'report',
      id: 'R-1',
      excerpt: 'semantic evidence',
    });
  });
});

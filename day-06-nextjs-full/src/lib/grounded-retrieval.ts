import { createHash } from 'node:crypto';
import { LocalModelUnavailableError, createLocalEmbeddings } from './local-model';
import { getSemanticCorpus, type SemanticCorpusRow } from './repository';
import {
  searchAll,
  truncateExcerpt,
  type SearchHit,
  type SearchKind,
} from './search';

export type RetrievalMode = 'hybrid' | 'keyword';

export interface GroundedEvidence {
  hits: SearchHit[];
  mode: RetrievalMode;
  fallbackReason?: string;
}

export interface RetrievalOptions {
  institutionId?: string;
  period?: string;
  kind?: SearchKind;
  limit?: number;
}

const EMBEDDING_CACHE_LIMIT = 1000;
const EMBEDDING_CACHE_TTL_MS = 15 * 60 * 1000;
const embeddingCache = new Map<string, { vector: number[]; expiresAt: number }>();

function embeddingCacheKey(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function readCachedEmbedding(text: string): number[] | undefined {
  const key = embeddingCacheKey(text);
  const cached = embeddingCache.get(key);
  if (!cached) return undefined;
  if (cached.expiresAt <= Date.now()) {
    embeddingCache.delete(key);
    return undefined;
  }
  embeddingCache.delete(key);
  embeddingCache.set(key, cached);
  return cached.vector;
}

function cacheEmbedding(text: string, vector: number[]): void {
  const key = embeddingCacheKey(text);
  if (embeddingCache.size >= EMBEDDING_CACHE_LIMIT) {
    const oldest = embeddingCache.keys().next().value;
    if (oldest) embeddingCache.delete(oldest);
  }
  embeddingCache.set(key, {
    vector,
    expiresAt: Date.now() + EMBEDDING_CACHE_TTL_MS,
  });
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || left.length !== right.length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  const magnitude = Math.sqrt(leftNorm * rightNorm);
  return magnitude === 0 ? 0 : dot / magnitude;
}

function toSearchHit(row: SemanticCorpusRow, rank: number): SearchHit {
  return {
    kind: row.kind,
    id: row.id,
    title: row.title,
    excerpt: truncateExcerpt(row.content, 1000),
    citation: row.citation,
    rank,
  };
}

function matchesFilters(hit: SearchHit, options: RetrievalOptions): boolean {
  if (options.kind && hit.kind !== options.kind) return false;
  if (options.institutionId && hit.citation.institutionId?.toUpperCase() !== options.institutionId.toUpperCase()) {
    return false;
  }
  if (
    options.period &&
    (hit.kind === 'institution' || hit.citation.period !== options.period)
  ) {
    return false;
  }
  return true;
}

async function rankSemanticCorpus(
  queryText: string,
  corpus: SemanticCorpusRow[],
  limit: number,
): Promise<SearchHit[]> {
  const queryVector = (await createLocalEmbeddings([queryText]))[0];
  const vectors = new Map<string, number[]>();
  const missing: SemanticCorpusRow[] = [];

  for (const row of corpus) {
    const cached = readCachedEmbedding(row.content);
    if (cached) vectors.set(row.id, cached);
    else missing.push(row);
  }

  for (let start = 0; start < missing.length; start += 32) {
    const batch = missing.slice(start, start + 32);
    const embeddings = await createLocalEmbeddings(batch.map((row) => row.content));
    batch.forEach((row, index) => {
      const vector = embeddings[index];
      cacheEmbedding(row.content, vector);
      vectors.set(row.id, vector);
    });
  }

  return corpus
    .map((row) => ({
      row,
      score: cosineSimilarity(queryVector, vectors.get(row.id) ?? []),
    }))
    .sort((left, right) => right.score - left.score || left.row.id.localeCompare(right.row.id))
    .slice(0, limit)
    .map(({ row, score }, index) => toSearchHit(row, score + (limit - index) * 1e-12));
}

export function reciprocalRankFuse(
  rankedLists: SearchHit[][],
  limit: number,
): SearchHit[] {
  const fused = new Map<string, { hit: SearchHit; score: number }>();
  for (const hits of rankedLists) {
    hits.forEach((hit, index) => {
      const existing = fused.get(`${hit.kind}:${hit.id}`);
      if (existing) {
        existing.score += 1 / (60 + index + 1);
        if (hit.excerpt.length > existing.hit.excerpt.length) existing.hit = hit;
      } else {
        fused.set(`${hit.kind}:${hit.id}`, {
          hit,
          score: 1 / (60 + index + 1),
        });
      }
    });
  }
  return [...fused.values()]
    .sort((left, right) => right.score - left.score || left.hit.title.localeCompare(right.hit.title))
    .slice(0, limit)
    .map(({ hit, score }) => ({ ...hit, rank: score }));
}

export async function searchGroundedEvidence(
  queryText: string,
  options: RetrievalOptions = {},
): Promise<GroundedEvidence> {
  const query = queryText.trim();
  const limit = options.limit ?? 6;
  const lexicalHits = (await searchAll(query, { limit: 25 }))
    .filter((hit) => matchesFilters(hit, options));
  const corpus = await getSemanticCorpus({
    institutionId: options.institutionId,
    period: options.period,
    limit: 400,
  });
  const scopedCorpus = corpus.filter((row) =>
    matchesFilters({
      ...toSearchHit(row, 0),
      id: row.id,
    }, options),
  );
  if (scopedCorpus.length === 0) {
    return {
      hits: lexicalHits.slice(0, limit),
      mode: 'keyword',
      fallbackReason: 'No indexed synthetic evidence is available for semantic ranking.',
    };
  }

  try {
    const semanticHits = await rankSemanticCorpus(query, scopedCorpus, Math.min(25, scopedCorpus.length));
    return {
      hits: reciprocalRankFuse([lexicalHits, semanticHits], limit),
      mode: 'hybrid',
    };
  } catch (error) {
    if (!(error instanceof LocalModelUnavailableError)) throw error;
    return {
      hits: lexicalHits.slice(0, limit),
      mode: 'keyword',
      fallbackReason: 'The local embedding model is unavailable; showing keyword matches.',
    };
  }
}

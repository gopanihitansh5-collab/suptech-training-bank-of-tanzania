import {
  ModelProviderResponseError,
  ModelProviderUnavailableError,
  generateChatCompletion,
  getLmStudioBaseUrl,
  isChatProviderAvailable,
} from './model-provider';

export {
  ModelProviderResponseError as LocalModelResponseError,
  ModelProviderUnavailableError as LocalModelUnavailableError,
};

export interface LocalChatMessage {
  role: 'system' | 'user';
  content: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getLocalModelBaseUrl(): string {
  return getLmStudioBaseUrl();
}

export async function isLocalChatModelAvailable(): Promise<boolean> {
  return isChatProviderAvailable({ bypassCache: true });
}

export async function isLocalEmbeddingModelAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${getLocalModelBaseUrl()}/models`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) return false;
    const payload: unknown = await response.json();
    if (!isRecord(payload) || !Array.isArray(payload.data)) return false;
    const configured =
      process.env.LM_STUDIO_EMBEDDING_MODEL?.trim() ||
      'text-embedding-nomic-embed-text-v1.5';
    return payload.data.some((entry) => {
      if (!isRecord(entry) || typeof entry.id !== 'string') return false;
      return entry.id === configured || entry.id.toLowerCase().includes('embed');
    });
  } catch {
    return false;
  }
}

export async function createLocalEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0 || texts.length > 32) {
    throw new RangeError('Embedding batches must contain between 1 and 32 texts.');
  }
  if (texts.some((text) => text.trim().length === 0 || text.length > 6000)) {
    throw new RangeError('Embedding text must contain 1 to 6,000 characters.');
  }

  let response: Response;
  try {
    response = await fetch(`${getLocalModelBaseUrl()}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.LM_STUDIO_EMBEDDING_MODEL ||
          'text-embedding-nomic-embed-text-v1.5',
        input: texts,
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new ModelProviderUnavailableError('The local embedding model could not be reached.');
  }

  if (!response.ok) {
    throw new ModelProviderUnavailableError(
      `The local embedding model returned HTTP ${response.status}.`,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ModelProviderResponseError('The local embedding model returned invalid JSON.');
  }
  if (!isRecord(payload) || !Array.isArray(payload.data) || payload.data.length !== texts.length) {
    throw new ModelProviderResponseError('The local embedding model returned an invalid batch.');
  }

  const ordered = new Array<number[]>(texts.length);
  for (const entry of payload.data) {
    if (!isRecord(entry) || !Number.isInteger(entry.index) || !Array.isArray(entry.embedding)) {
      throw new ModelProviderResponseError('The local embedding model returned an invalid vector.');
    }
    const index = entry.index as number;
    if (index < 0 || index >= texts.length || ordered[index]) {
      throw new ModelProviderResponseError('The local embedding model returned duplicate indices.');
    }
    const vector = entry.embedding;
    if (
      vector.length === 0 ||
      vector.length > 4096 ||
      vector.some((value) => typeof value !== 'number' || !Number.isFinite(value))
    ) {
      throw new ModelProviderResponseError('The local embedding model returned a non-finite vector.');
    }
    ordered[index] = vector as number[];
  }

  if (ordered.some((vector) => !vector || vector.length !== ordered[0]?.length)) {
    throw new ModelProviderResponseError('The local embedding model returned inconsistent dimensions.');
  }
  return ordered;
}

export async function generateLocalChatCompletion(
  messages: LocalChatMessage[],
  maxTokens = 700,
): Promise<string> {
  return generateChatCompletion(messages, maxTokens);
}

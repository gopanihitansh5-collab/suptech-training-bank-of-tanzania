export class LocalModelUnavailableError extends Error {
  constructor(message = 'The configured local model is unavailable.') {
    super(message);
    this.name = 'LocalModelUnavailableError';
  }
}

export class LocalModelResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalModelResponseError';
  }
}

export interface LocalChatMessage {
  role: 'system' | 'user';
  content: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getLocalModelBaseUrl(): string {
  const configured = process.env.LM_STUDIO_BASE_URL?.trim() || 'http://127.0.0.1:1235/v1';
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new LocalModelUnavailableError('The local model endpoint URL is invalid.');
  }
  const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);
  if (
    !loopbackHosts.has(url.hostname) ||
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new LocalModelUnavailableError(
      'The configured model endpoint must be a credential-free loopback URL.',
    );
  }
  return url.toString().replace(/\/+$/, '');
}

export async function isLocalChatModelAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${getLocalModelBaseUrl()}/models`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) return false;
    const payload: unknown = await response.json();
    return isRecord(payload) && Array.isArray(payload.data) && payload.data.length > 0;
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
    throw new LocalModelUnavailableError('The local embedding model could not be reached.');
  }

  if (!response.ok) {
    throw new LocalModelUnavailableError(
      `The local embedding model returned HTTP ${response.status}.`,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new LocalModelResponseError('The local embedding model returned invalid JSON.');
  }
  if (!isRecord(payload) || !Array.isArray(payload.data) || payload.data.length !== texts.length) {
    throw new LocalModelResponseError('The local embedding model returned an invalid batch.');
  }

  const ordered = new Array<number[]>(texts.length);
  for (const entry of payload.data) {
    if (!isRecord(entry) || !Number.isInteger(entry.index) || !Array.isArray(entry.embedding)) {
      throw new LocalModelResponseError('The local embedding model returned an invalid vector.');
    }
    const index = entry.index as number;
    if (index < 0 || index >= texts.length || ordered[index]) {
      throw new LocalModelResponseError('The local embedding model returned duplicate indices.');
    }
    const vector = entry.embedding;
    if (
      vector.length === 0 ||
      vector.length > 4096 ||
      vector.some((value) => typeof value !== 'number' || !Number.isFinite(value))
    ) {
      throw new LocalModelResponseError('The local embedding model returned a non-finite vector.');
    }
    ordered[index] = vector as number[];
  }

  if (ordered.some((vector) => !vector || vector.length !== ordered[0]?.length)) {
    throw new LocalModelResponseError('The local embedding model returned inconsistent dimensions.');
  }
  return ordered;
}

export async function generateLocalChatCompletion(
  messages: LocalChatMessage[],
  maxTokens = 700,
): Promise<string> {
  if (messages.length < 2 || messages.length > 4 || !Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 1200) {
    throw new RangeError('The local chat request exceeds its configured limits.');
  }
  if (messages.some((message) => message.content.length > 10_000)) {
    throw new RangeError('Local chat messages must not exceed 10,000 characters.');
  }

  let response: Response;
  try {
    response = await fetch(`${getLocalModelBaseUrl()}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.LM_STUDIO_CHAT_MODEL || 'qwen/qwen3.6-35b-a3b',
        messages,
        max_tokens: maxTokens,
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new LocalModelUnavailableError('The local chat model could not be reached.');
  }

  if (!response.ok) {
    throw new LocalModelUnavailableError(
      `The local chat model returned HTTP ${response.status}.`,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new LocalModelResponseError('The local chat model returned invalid JSON.');
  }
  const choices = isRecord(payload) && Array.isArray(payload.choices) ? payload.choices : [];
  const first = choices[0];
  const message = isRecord(first) && isRecord(first.message) ? first.message : null;
  const content = message?.content;
  if (typeof content !== 'string' || content.trim().length === 0 || content.length > 6000) {
    throw new LocalModelResponseError('The local chat model returned an empty or oversized answer.');
  }
  return content.trim();
}

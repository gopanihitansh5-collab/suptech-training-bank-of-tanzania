export type ChatProviderName = 'groq' | 'lmstudio';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class ModelProviderUnavailableError extends Error {
  constructor(message = 'The configured chat provider is unavailable.') {
    super(message);
    this.name = 'ModelProviderUnavailableError';
  }
}

export class ModelProviderResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelProviderResponseError';
  }
}

class GroqModelSelectionError extends Error {
  constructor() {
    super('The requested Groq model is not available.');
    this.name = 'GroqModelSelectionError';
  }
}

class GroqFatalError extends ModelProviderUnavailableError {
  constructor(message: string) {
    super(message);
    this.name = 'GroqFatalError';
  }
}

class GroqAbortedError extends Error {
  constructor() {
    super('The Groq request was superseded by a faster model.');
    this.name = 'GroqAbortedError';
  }
}

const DEFAULT_GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const DEFAULT_GROQ_CHAT_MODEL = 'openai/gpt-oss-120b';
const DEFAULT_GROQ_CHAT_MODEL_FALLBACK = 'llama-3.3-70b-versatile';
const DEFAULT_LM_STUDIO_BASE_URL = 'http://127.0.0.1:1235/v1';
const DEFAULT_LM_STUDIO_CHAT_MODEL = 'qwen/qwen3.6-35b-a3b';
const AVAILABILITY_TTL_MS = 15_000;
const AVAILABILITY_TIMEOUT_MS = 2_500;
const GROQ_MODEL_LIST_TIMEOUT_MS = 5_000;
const GROQ_MODEL_LIST_TTL_MS = 10 * 60 * 1000;
const GROQ_MODEL_FAILURE_COOLDOWN_MS = 60 * 1000;
const GROQ_MODEL_EXPLORATION_INTERVAL = 5;
const MAX_MESSAGES = 4;
const MIN_MESSAGES = 2;
const MAX_MESSAGE_CHARS = 10_000;
const MAX_TOKENS = 1_200;
const MAX_RESPONSE_CHARS = 6_000;

/**
 * Seed order used until real latency is observed. Every model returned by
 * Groq's /models endpoint is still eligible; this list only decides the first
 * attempt and the tie-break order for unmeasured models.
 */
const DEFAULT_GROQ_MODEL_PRIORITY = [
  'openai/gpt-oss-20b',
  'llama-3.1-8b-instant',
  'openai/gpt-oss-120b',
  'llama-3.3-70b-versatile',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'qwen/qwen3-32b',
  'moonshotai/kimi-k2-instruct',
  'allam-2-7b',
];

const NON_CHAT_GROQ_MODEL_PATTERN =
  /(whisper|tts|playai|guard|embed|distil|audio|speech)/i;

interface GroqModelStat {
  samples: number;
  totalLatencyMs: number;
  failures: number;
  lastFailureAt: number;
}

let availabilityCache:
  | { key: string; available: boolean; expiresAt: number }
  | null = null;
let groqModelCache:
  | { key: string; models: string[]; expiresAt: number }
  | null = null;
const groqModelStats = new Map<string, GroqModelStat>();
let groqRequestCount = 0;
let groqExplorationCursor = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readTimeout(): number {
  const parsed = Number(process.env.GROQ_TIMEOUT_MS);
  if (!Number.isFinite(parsed) || parsed < 500 || parsed > 120_000) return 30_000;
  return Math.trunc(parsed);
}

export function getLmStudioBaseUrl(): string {
  const configured =
    process.env.LM_STUDIO_BASE_URL?.trim() || DEFAULT_LM_STUDIO_BASE_URL;
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new ModelProviderUnavailableError('The local model endpoint URL is invalid.');
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
    throw new ModelProviderUnavailableError(
      'The configured model endpoint must be a credential-free loopback URL.',
    );
  }
  return url.toString().replace(/\/+$/, '');
}

function resolveGroqBaseUrl(): string {
  const configured = process.env.GROQ_BASE_URL?.trim();
  const raw = configured || DEFAULT_GROQ_BASE_URL;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ModelProviderUnavailableError('The chat provider URL is invalid.');
  }
  if (url.protocol !== 'https:') {
    throw new ModelProviderUnavailableError('The chat provider URL must use HTTPS.');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new ModelProviderUnavailableError(
      'The chat provider URL must not contain credentials, query parameters, or fragments.',
    );
  }
  const host = url.hostname.toLowerCase();
  if (host !== 'api.groq.com' && !configured) {
    throw new ModelProviderUnavailableError(
      'The chat provider URL must target api.groq.com or an explicitly configured HTTPS host.',
    );
  }
  return url.toString().replace(/\/+$/, '');
}

function readGroqModelAttempts(): number {
  const parsed = Number(process.env.GROQ_MODEL_ATTEMPTS);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 12) return 6;
  return Math.trunc(parsed);
}

function readGroqParallelAttempts(): number {
  const parsed = Number(process.env.GROQ_PARALLEL_ATTEMPTS);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 4) return 2;
  return Math.trunc(parsed);
}

function readGroqHedgeDelay(): number {
  const parsed = Number(process.env.GROQ_HEDGE_DELAY_MS);
  if (!Number.isFinite(parsed) || parsed < 100 || parsed > 5_000) return 600;
  return Math.trunc(parsed);
}

function isChatCapableGroqModel(modelId: string): boolean {
  return Boolean(modelId) && !NON_CHAT_GROQ_MODEL_PATTERN.test(modelId);
}

function groqModelPriority(modelId: string): number {
  const configured =
    process.env.GROQ_CHAT_MODEL?.trim() || DEFAULT_GROQ_CHAT_MODEL;
  if (modelId === configured) return -2;
  const fallback =
    process.env.GROQ_CHAT_MODEL_FALLBACK?.trim() ||
    DEFAULT_GROQ_CHAT_MODEL_FALLBACK;
  if (modelId === fallback) return -1;
  const index = DEFAULT_GROQ_MODEL_PRIORITY.indexOf(modelId);
  return index === -1 ? 500 : index;
}

function averageLatency(modelId: string): number {
  const stat = groqModelStats.get(modelId);
  if (!stat || stat.samples === 0) return Number.POSITIVE_INFINITY;
  return stat.totalLatencyMs / stat.samples;
}

function recordGroqSuccess(modelId: string, latencyMs: number): void {
  const stat = groqModelStats.get(modelId) ?? {
    samples: 0,
    totalLatencyMs: 0,
    failures: 0,
    lastFailureAt: 0,
  };
  stat.samples += 1;
  stat.totalLatencyMs += latencyMs;
  stat.failures = 0;
  groqModelStats.set(modelId, stat);
}

function recordGroqFailure(modelId: string): void {
  const stat = groqModelStats.get(modelId) ?? {
    samples: 0,
    totalLatencyMs: 0,
    failures: 0,
    lastFailureAt: 0,
  };
  stat.failures += 1;
  stat.lastFailureAt = Date.now();
  groqModelStats.set(modelId, stat);
}

/**
 * Fetches every chat-capable model the configured Groq key can use. The list
 * is cached briefly so a completion does not pay for discovery every time.
 * When discovery fails we fall back to the configured seed order rather than
 * failing closed, because the chat endpoint may still be reachable.
 */
export async function listGroqChatModels(
  baseUrl: string,
  apiKey: string,
  options: { bypassCache?: boolean } = {},
): Promise<string[]> {
  if (
    !options.bypassCache &&
    groqModelCache &&
    groqModelCache.key === baseUrl &&
    groqModelCache.expiresAt > Date.now()
  ) {
    return groqModelCache.models;
  }

  let models: string[] = [];
  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(GROQ_MODEL_LIST_TIMEOUT_MS),
    });
    if (response.ok) {
      const payload: unknown = await response.json();
      const rows =
        isRecord(payload) && Array.isArray(payload.data) ? payload.data : [];
      const seen = new Set<string>();
      for (const row of rows) {
        if (!isRecord(row) || typeof row.id !== 'string') continue;
        const id = row.id.trim();
        if (!isChatCapableGroqModel(id) || seen.has(id)) continue;
        seen.add(id);
        models.push(id);
      }
    }
  } catch {
    models = [];
  }

  if (models.length > 0) {
    groqModelCache = {
      key: baseUrl,
      models,
      expiresAt: Date.now() + GROQ_MODEL_LIST_TTL_MS,
    };
  }
  return models;
}

/**
 * Orders candidate models by observed latency, then by the seed priority for
 * models that have not been measured yet. Every few requests one unmeasured
 * model is promoted to the front so newly added free models can be discovered
 * without giving up the fastest known model on normal traffic.
 */
export function rankGroqModels(available: string[]): string[] {
  const candidates = new Set<string>();
  const configured =
    process.env.GROQ_CHAT_MODEL?.trim() || DEFAULT_GROQ_CHAT_MODEL;
  const fallback =
    process.env.GROQ_CHAT_MODEL_FALLBACK?.trim() ||
    DEFAULT_GROQ_CHAT_MODEL_FALLBACK;
  candidates.add(configured);
  candidates.add(fallback);
  for (const model of available) candidates.add(model);
  if (candidates.size === 0) {
    for (const model of DEFAULT_GROQ_MODEL_PRIORITY) candidates.add(model);
  }

  const now = Date.now();
  const all = [...candidates];
  const notCoolingDown = all.filter((model) => {
    const stat = groqModelStats.get(model);
    if (!stat) return true;
    return !(
      stat.failures >= 2 &&
      now - stat.lastFailureAt < GROQ_MODEL_FAILURE_COOLDOWN_MS
    );
  });
  const pool = notCoolingDown.length > 0 ? notCoolingDown : all;

  const measured = pool
    .filter((model) => (groqModelStats.get(model)?.samples ?? 0) > 0)
    .sort(
      (left, right) =>
        averageLatency(left) - averageLatency(right) ||
        left.localeCompare(right),
    );
  const unmeasured = pool
    .filter((model) => (groqModelStats.get(model)?.samples ?? 0) === 0)
    .sort(
      (left, right) =>
        groqModelPriority(left) - groqModelPriority(right) ||
        left.localeCompare(right),
    );

  let ordered = [...measured, ...unmeasured];
  if (
    unmeasured.length > 0 &&
    groqRequestCount > 0 &&
    groqRequestCount % GROQ_MODEL_EXPLORATION_INTERVAL === 0
  ) {
    const probe = unmeasured[groqExplorationCursor % unmeasured.length];
    groqExplorationCursor += 1;
    ordered = [probe, ...ordered.filter((model) => model !== probe)];
  }

  return ordered.slice(0, readGroqModelAttempts());
}

export function getActiveChatProviderName(): ChatProviderName {
  const requested = process.env.MODEL_PROVIDER?.trim().toLowerCase();
  if (requested === 'groq') return 'groq';
  if (requested === 'lmstudio') return 'lmstudio';
  if (process.env.GROQ_API_KEY?.trim()) return 'groq';
  return 'lmstudio';
}

export function getChatModelId(): string {
  if (getActiveChatProviderName() === 'groq') {
    return process.env.GROQ_CHAT_MODEL?.trim() || DEFAULT_GROQ_CHAT_MODEL;
  }
  return process.env.LM_STUDIO_CHAT_MODEL?.trim() || DEFAULT_LM_STUDIO_CHAT_MODEL;
}

export function getProviderStatus(): {
  provider: ChatProviderName;
  model: string;
  baseUrl: string;
  configured: boolean;
} {
  const provider = getActiveChatProviderName();
  let baseUrl: string;
  try {
    baseUrl = provider === 'groq' ? resolveGroqBaseUrl() : getLmStudioBaseUrl();
  } catch {
    baseUrl =
      provider === 'groq'
        ? process.env.GROQ_BASE_URL?.trim() || DEFAULT_GROQ_BASE_URL
        : process.env.LM_STUDIO_BASE_URL?.trim() || DEFAULT_LM_STUDIO_BASE_URL;
  }
  const configured =
    provider === 'groq'
      ? Boolean(process.env.GROQ_API_KEY?.trim())
      : Boolean(process.env.LM_STUDIO_BASE_URL?.trim());
  return { provider, model: getChatModelId(), baseUrl, configured };
}

export function clearChatProviderAvailabilityCache(): void {
  availabilityCache = null;
  groqModelCache = null;
  groqModelStats.clear();
  groqRequestCount = 0;
  groqExplorationCursor = 0;
}

export async function isChatProviderAvailable(
  options: { bypassCache?: boolean } = {},
): Promise<boolean> {
  const provider = getActiveChatProviderName();
  let baseUrl: string;
  let apiKey = '';
  try {
    if (provider === 'groq') {
      baseUrl = resolveGroqBaseUrl();
      apiKey = process.env.GROQ_API_KEY?.trim() ?? '';
      if (!apiKey) return false;
    } else {
      baseUrl = getLmStudioBaseUrl();
    }
  } catch {
    return false;
  }

  const key = `${provider}|${baseUrl}`;
  if (
    !options.bypassCache &&
    availabilityCache &&
    availabilityCache.key === key &&
    availabilityCache.expiresAt > Date.now()
  ) {
    return availabilityCache.available;
  }

  let available = false;
  try {
    if (provider === 'groq') {
      available =
        (await listGroqChatModels(baseUrl, apiKey, {
          bypassCache: options.bypassCache,
        })).length > 0;
    } else {
      const response = await fetch(`${baseUrl}/models`, {
        signal: AbortSignal.timeout(AVAILABILITY_TIMEOUT_MS),
      });
      if (response.ok) {
        const payload: unknown = await response.json();
        available =
          isRecord(payload) &&
          Array.isArray(payload.data) &&
          payload.data.length > 0;
      }
    }
  } catch {
    available = false;
  }

  availabilityCache = {
    key,
    available,
    expiresAt: Date.now() + AVAILABILITY_TTL_MS,
  };
  return available;
}

function validateRequest(messages: ChatMessage[], maxTokens: number): void {
  if (
    !Array.isArray(messages) ||
    messages.length < MIN_MESSAGES ||
    messages.length > MAX_MESSAGES
  ) {
    throw new RangeError(
      `The chat request must include between ${MIN_MESSAGES} and ${MAX_MESSAGES} messages.`,
    );
  }
  if (
    !Number.isInteger(maxTokens) ||
    maxTokens < 1 ||
    maxTokens > MAX_TOKENS
  ) {
    throw new RangeError('The chat request exceeds its configured token limits.');
  }
  for (const message of messages) {
    if (
      !message ||
      !['system', 'user', 'assistant'].includes(message.role) ||
      typeof message.content !== 'string'
    ) {
      throw new RangeError('The chat request contains an invalid message.');
    }
    if (message.content.length > MAX_MESSAGE_CHARS) {
      throw new RangeError('Chat messages must not exceed 10,000 characters.');
    }
  }
}

function extractContent(payload: unknown): string {
  const choices =
    isRecord(payload) && Array.isArray(payload.choices) ? payload.choices : [];
  const first = choices[0];
  const message =
    isRecord(first) && isRecord(first.message) ? first.message : null;
  const content = message?.content;
  if (
    typeof content !== 'string' ||
    content.trim().length === 0 ||
    content.length > MAX_RESPONSE_CHARS
  ) {
    throw new ModelProviderResponseError(
      'The chat provider returned an empty or invalid answer.',
    );
  }
  return content.trim();
}

export function formatModelResponseText(content: string): string {
  return content
    .replace(/\r\n?/g, '\n')
    .replace(/(^|\n)\s{0,3}#{1,6}\s*/g, '$1')
    .replace(/(^|\n)\s*[*+-]\s+/g, '$1')
    .replace(/[*#]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function requestLmStudio(
  messages: ChatMessage[],
  maxTokens: number,
): Promise<string> {
  let baseUrl: string;
  try {
    baseUrl = getLmStudioBaseUrl();
  } catch (error) {
    if (error instanceof ModelProviderUnavailableError) throw error;
    throw new ModelProviderUnavailableError(
      'The local chat model endpoint is invalid.',
    );
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: getChatModelId(),
        messages,
        max_tokens: maxTokens,
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new ModelProviderUnavailableError(
      'The local chat model could not be reached.',
    );
  }

  if (!response.ok) {
    throw new ModelProviderUnavailableError(
      `The local chat model returned HTTP ${response.status}.`,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ModelProviderResponseError(
      'The local chat model returned invalid JSON.',
    );
  }
  return extractContent(payload);
}

async function requestGroqModel(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
  supersededBy?: AbortSignal,
): Promise<string> {
  const timeoutSignal = AbortSignal.timeout(readTimeout());
  const signal = supersededBy
    ? AbortSignal.any([supersededBy, timeoutSignal])
    : timeoutSignal;
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature: 0.1,
      }),
      signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      if (supersededBy?.aborted) throw new GroqAbortedError();
      throw new ModelProviderUnavailableError(
        'The chat provider request timed out.',
      );
    }
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new ModelProviderUnavailableError(
        'The chat provider request timed out.',
      );
    }
    throw new ModelProviderUnavailableError(
      'The chat provider could not be reached.',
    );
  }

  if (!response.ok) {
    let diagnostic = '';
    try {
      diagnostic = (await response.text()).slice(0, 1_000);
    } catch {
      diagnostic = '';
    }
    if (
      (response.status === 404 ||
        (response.status === 400 && /model/i.test(diagnostic))) &&
      !/rate limit|quota/i.test(diagnostic)
    ) {
      throw new GroqModelSelectionError();
    }
    if (response.status === 401 || response.status === 403) {
      throw new GroqFatalError(
        'The chat provider rejected the configured credentials.',
      );
    }
    if (
      response.status === 400 ||
      response.status === 413 ||
      response.status === 422
    ) {
      throw new GroqFatalError(
        `The chat provider rejected the request (HTTP ${response.status}).`,
      );
    }
    if (response.status === 429 || response.status >= 500) {
      throw new ModelProviderUnavailableError(
        `The chat provider is temporarily unavailable (HTTP ${response.status}).`,
      );
    }
    throw new ModelProviderUnavailableError(
      `The chat provider returned HTTP ${response.status}.`,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ModelProviderResponseError(
      'The chat provider returned invalid JSON.',
    );
  }
  return extractContent(payload);
}

async function requestGroq(
  messages: ChatMessage[],
  maxTokens: number,
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new ModelProviderUnavailableError(
      'The configured chat provider is not available.',
    );
  }
  const baseUrl = resolveGroqBaseUrl();
  groqRequestCount += 1;
  const discovered = await listGroqChatModels(baseUrl, apiKey);
  const models = rankGroqModels(discovered);
  if (models.length === 0) {
    throw new ModelProviderUnavailableError(
      'The configured chat provider models are not available.',
    );
  }

  const parallel = Math.min(readGroqParallelAttempts(), models.length);
  const hedgeDelay = readGroqHedgeDelay();

  return new Promise<string>((resolve, reject) => {
    const controllers = new Set<AbortController>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let nextIndex = 0;
    let inFlight = 0;
    let settled = false;
    let lastError: unknown = null;

    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      complete();
    };

    const abortAll = () => {
      for (const controller of controllers) controller.abort();
      controllers.clear();
    };

    const rejectExhausted = () => {
      finish(() => {
        if (lastError instanceof ModelProviderResponseError) {
          reject(lastError);
          return;
        }
        if (lastError instanceof GroqModelSelectionError) {
          reject(
            new ModelProviderUnavailableError(
              'The configured chat provider models are not available.',
            ),
          );
          return;
        }
        reject(
          new ModelProviderUnavailableError(
            `The chat provider is temporarily unavailable; all ${models.length} free chat models failed.`,
          ),
        );
      });
    };

    const launch = () => {
      if (settled || nextIndex >= models.length) {
        if (!settled && inFlight === 0) rejectExhausted();
        return;
      }
      const model = models[nextIndex];
      nextIndex += 1;
      const controller = new AbortController();
      controllers.add(controller);
      inFlight += 1;
      const startedAt = Date.now();

      requestGroqModel(
        baseUrl,
        apiKey,
        model,
        messages,
        maxTokens,
        controller.signal,
      )
        .then((content) => {
          if (settled) return;
          recordGroqSuccess(model, Date.now() - startedAt);
          finish(() => {
            abortAll();
            resolve(content);
          });
        })
        .catch((error: unknown) => {
          controllers.delete(controller);
          inFlight -= 1;
          if (settled) return;
          if (error instanceof GroqAbortedError) return;
          recordGroqFailure(model);
          if (error instanceof GroqFatalError) {
            finish(() => {
              abortAll();
              reject(error);
            });
            return;
          }
          lastError = error;
          launch();
          if (nextIndex >= models.length && inFlight === 0) rejectExhausted();
        });
    };

    for (let index = 0; index < parallel; index += 1) {
      if (index === 0) {
        launch();
        continue;
      }
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (inFlight < parallel) launch();
      }, hedgeDelay * index);
      timers.add(timer);
    }
  });
}

export async function generateChatCompletion(
  messages: ChatMessage[],
  maxTokens = 700,
): Promise<string> {
  validateRequest(messages, maxTokens);
  if (getActiveChatProviderName() === 'groq') {
    return requestGroq(messages, maxTokens);
  }
  return requestLmStudio(messages, maxTokens);
}

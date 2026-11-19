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

const DEFAULT_GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const DEFAULT_GROQ_CHAT_MODEL = 'openai/gpt-oss-20b';
const DEFAULT_GROQ_CHAT_MODEL_FALLBACK = 'llama-3.3-70b-versatile';
const DEFAULT_LM_STUDIO_BASE_URL = 'http://127.0.0.1:1235/v1';
const DEFAULT_LM_STUDIO_CHAT_MODEL = 'qwen/qwen3.6-35b-a3b';
const AVAILABILITY_TTL_MS = 15_000;
const AVAILABILITY_TIMEOUT_MS = 2_500;
const MAX_MESSAGES = 4;
const MIN_MESSAGES = 2;
const MAX_MESSAGE_CHARS = 10_000;
const MAX_TOKENS = 1_200;
const MAX_RESPONSE_CHARS = 6_000;

let availabilityCache:
  | { key: string; available: boolean; expiresAt: number }
  | null = null;

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

export function getActiveChatProviderName(): ChatProviderName {
  const requested = process.env.MODEL_PROVIDER?.trim().toLowerCase();
  if (requested === 'groq' && Boolean(process.env.GROQ_API_KEY?.trim())) {
    return 'groq';
  }
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
}

export async function isChatProviderAvailable(
  options: { bypassCache?: boolean } = {},
): Promise<boolean> {
  const provider = getActiveChatProviderName();
  let baseUrl: string;
  let headers: Record<string, string> = {};
  try {
    if (provider === 'groq') {
      baseUrl = resolveGroqBaseUrl();
      const apiKey = process.env.GROQ_API_KEY?.trim();
      if (!apiKey) return false;
      headers = { Authorization: `Bearer ${apiKey}` };
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
    const response = await fetch(`${baseUrl}/models`, {
      headers,
      signal: AbortSignal.timeout(AVAILABILITY_TIMEOUT_MS),
    });
    if (response.ok) {
      const payload: unknown = await response.json();
      available =
        isRecord(payload) &&
        Array.isArray(payload.data) &&
        payload.data.length > 0;
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
): Promise<string> {
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
      signal: AbortSignal.timeout(readTimeout()),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === 'AbortError' || error.name === 'TimeoutError')
    ) {
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
  const primaryModel =
    process.env.GROQ_CHAT_MODEL?.trim() || DEFAULT_GROQ_CHAT_MODEL;
  const fallbackModel =
    process.env.GROQ_CHAT_MODEL_FALLBACK?.trim() ||
    DEFAULT_GROQ_CHAT_MODEL_FALLBACK;

  try {
    return await requestGroqModel(
      baseUrl,
      apiKey,
      primaryModel,
      messages,
      maxTokens,
    );
  } catch (error) {
    if (!(error instanceof GroqModelSelectionError)) throw error;
    if (!fallbackModel || fallbackModel === primaryModel) {
      throw new ModelProviderUnavailableError(
        'The configured chat provider model is not available.',
      );
    }
  }

  try {
    return await requestGroqModel(
      baseUrl,
      apiKey,
      fallbackModel,
      messages,
      maxTokens,
    );
  } catch (error) {
    if (error instanceof GroqModelSelectionError) {
      throw new ModelProviderUnavailableError(
        'The configured chat provider models are not available.',
      );
    }
    throw error;
  }
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

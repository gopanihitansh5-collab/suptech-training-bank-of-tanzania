import { metric } from '@vercel/functions';
import { NextResponse } from 'next/server';
import { errorResponse, readJsonBody, RequestValidationError } from '../../../../lib/api-errors';
import { AuthError, requireDemoSession } from '../../../../lib/auth';
import {
  answerPageAssistantQuestion,
  buildPageAssistantContext,
  validatePageAssistantHistory,
} from '../../../../lib/page-assistant';
import { getActiveChatProviderName } from '../../../../lib/model-provider';

const MAX_BODY_BYTES = 8_000;
const MAX_QUESTION_CHARS = 500;
const PAGE_TAGS = new Set([
  'institutions',
  'analytics',
  'exceptions',
  'reports',
  'data-explorer',
  'assistant',
  'agents',
  'search',
  'documents',
  'system-health',
  'settings',
]);
const OUTCOMES = new Set(['success', 'fallback', 'rejected', 'denied', 'error']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pageMetricTag(pathname: string | undefined): string {
  const segment = pathname?.split('/').filter(Boolean)[0] ?? 'overview';
  return PAGE_TAGS.has(segment) ? segment : 'other';
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  let outcome = 'error';
  let page = 'other';
  const provider = getActiveChatProviderName();

  try {
    await requireDemoSession();

    const origin = request.headers.get('origin');
    if (!origin || origin !== new URL(request.url).origin) {
      outcome = 'denied';
      throw new AuthError(403, 'Invalid request origin.');
    }

    const body = await readJsonBody(request, MAX_BODY_BYTES);
    if (!isRecord(body)) {
      throw new RequestValidationError('The request body must be an object.');
    }
    if (
      Object.keys(body).some((key) =>
        !['question', 'pathname', 'filters', 'history', 'syntheticOnlyConfirmed'].includes(key),
      )
    ) {
      throw new RequestValidationError('The request contains unsupported fields.');
    }
    if (body.syntheticOnlyConfirmed !== true) {
      throw new RequestValidationError(
        'Confirm that the question and dashboard use synthetic training data only.',
      );
    }
    if (
      typeof body.question !== 'string' ||
      body.question.trim().length < 2 ||
      body.question.length > MAX_QUESTION_CHARS
    ) {
      throw new RequestValidationError(
        `Question must contain 2-${MAX_QUESTION_CHARS} characters.`,
      );
    }
    if (
      typeof body.pathname !== 'string' ||
      !body.pathname.startsWith('/') ||
      body.pathname.length > 200 ||
      body.pathname.includes('?') ||
      body.pathname.includes('#')
    ) {
      throw new RequestValidationError('The active dashboard page is invalid.');
    }
    page = pageMetricTag(body.pathname);
    const history = validatePageAssistantHistory(body.history);
    const context = await buildPageAssistantContext(body.pathname, body.filters);
    const result = await answerPageAssistantQuestion({
      question: body.question.trim(),
      context,
      history,
    });
    outcome = result.mode === 'model' ? 'success' : 'fallback';
    const response = NextResponse.json(result);
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    return response;
  } catch (error) {
    const response = errorResponse(error);
    outcome = response.status === 401 || response.status === 403
      ? 'denied'
      : response.status < 500
        ? 'rejected'
        : 'error';
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    return response;
  } finally {
    metric('contextual_assistant.answer', 1, {
      outcome: OUTCOMES.has(outcome) ? outcome : 'error',
      page,
      provider,
    });
    metric('contextual_assistant.duration_ms', performance.now() - startedAt, {
      outcome: OUTCOMES.has(outcome) ? outcome : 'error',
      provider,
    });
  }
}

import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => ({
  requireDemoSession: vi.fn(),
}));
const assistantMocks = vi.hoisted(() => ({
  answerPageAssistantQuestion: vi.fn(),
  buildPageAssistantContext: vi.fn(),
  validatePageAssistantHistory: vi.fn(),
}));
const providerMocks = vi.hoisted(() => ({
  getActiveChatProviderName: vi.fn(),
}));

vi.mock('../../../../lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/auth')>();
  return { ...actual, ...authMocks };
});
vi.mock('../../../../lib/page-assistant', () => assistantMocks);
vi.mock('../../../../lib/model-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../lib/model-provider')>();
  return { ...actual, ...providerMocks };
});

import { AuthError } from '../../../../lib/auth';
import { POST } from './route';

const answer = {
  answer: 'Deposits total 1,200 TZS bn [A1].',
  citations: [{ id: 'A1', label: 'Portfolio deposits', value: '1,200' }],
  pageLabel: 'Executive overview',
  contextScope: 'Executive overview',
  period: '2026-10',
  provider: 'groq',
  model: 'openai/gpt-oss-120b',
  mode: 'model',
};

function assistantRequest(body: Record<string, unknown>, origin = 'https://dashboard.test') {
  return new Request('https://dashboard.test/api/assistant/contextual-answer', {
    method: 'POST',
    headers: {
      origin,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  authMocks.requireDemoSession.mockResolvedValue({
    userId: 'demo.supervisor',
    role: 'supervisor',
    expiresAt: Date.now() + 60_000,
  });
  assistantMocks.validatePageAssistantHistory.mockReturnValue([]);
  assistantMocks.buildPageAssistantContext.mockResolvedValue({
    pageLabel: 'Executive overview',
    scope: 'Executive overview',
    period: '2026-10',
    facts: [{ id: 'A1', label: 'Portfolio deposits', value: '1,200' }],
  });
  assistantMocks.answerPageAssistantQuestion.mockResolvedValue(answer);
  providerMocks.getActiveChatProviderName.mockReturnValue('groq');
});

describe('contextual assistant route', () => {
  it('authenticates, enforces synthetic-only consent, and returns a non-cacheable grounded answer', async () => {
    const response = await POST(assistantRequest({
      question: 'How much are deposits?',
      pathname: '/',
      filters: {},
      history: [],
      syntheticOnlyConfirmed: true,
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(payload).toEqual(answer);
    expect(assistantMocks.buildPageAssistantContext).toHaveBeenCalledWith('/', {});
    expect(assistantMocks.answerPageAssistantQuestion).toHaveBeenCalledWith({
      question: 'How much are deposits?',
      context: expect.objectContaining({ pageLabel: 'Executive overview' }),
      history: [],
    });
  });

  it('rejects unauthenticated, cross-origin, and unconfirmed requests before using page data', async () => {
    authMocks.requireDemoSession.mockRejectedValueOnce(new AuthError(401, 'Sign in required.'));
    const unauthenticated = await POST(assistantRequest({
      question: 'How much are deposits?',
      pathname: '/',
      syntheticOnlyConfirmed: true,
    }));
    const crossOrigin = await POST(assistantRequest({
      question: 'How much are deposits?',
      pathname: '/',
      syntheticOnlyConfirmed: true,
    }, 'https://other.test'));
    const unconfirmed = await POST(assistantRequest({
      question: 'How much are deposits?',
      pathname: '/',
      syntheticOnlyConfirmed: false,
    }));

    expect(unauthenticated.status).toBe(401);
    expect(crossOrigin.status).toBe(403);
    expect(unconfirmed.status).toBe(400);
    expect(assistantMocks.buildPageAssistantContext).not.toHaveBeenCalled();
    expect(assistantMocks.answerPageAssistantQuestion).not.toHaveBeenCalled();
  });

  it('rejects an oversized question before constructing dashboard context', async () => {
    const response = await POST(assistantRequest({
      question: 'x'.repeat(501),
      pathname: '/',
      syntheticOnlyConfirmed: true,
    }));

    expect(response.status).toBe(400);
    expect(assistantMocks.buildPageAssistantContext).not.toHaveBeenCalled();
  });
});

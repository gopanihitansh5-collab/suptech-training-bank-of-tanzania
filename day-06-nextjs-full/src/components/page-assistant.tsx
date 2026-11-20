'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';

interface AssistantFact {
  id: string;
  label: string;
  value: string;
}

interface AssistantAnswer {
  answer: string;
  citations: AssistantFact[];
  pageLabel: string;
  contextScope: string;
  period: string | null;
  provider: 'groq' | 'lmstudio';
  model: string;
  mode: 'model' | 'deterministic_fallback';
}

interface ConversationTurn {
  question: string;
  result?: AssistantAnswer;
}

const FILTER_KEYS = [
  'period',
  'indicator',
  'search',
  'region',
  'status',
  'severity',
  'institutionId',
] as const;

function isAssistantAnswer(value: unknown): value is AssistantAnswer {
  if (typeof value !== 'object' || value === null) return false;
  const answer = value as Partial<AssistantAnswer>;
  return (
    typeof answer.answer === 'string' &&
    Array.isArray(answer.citations) &&
    typeof answer.pageLabel === 'string' &&
    typeof answer.contextScope === 'string' &&
    (answer.period === null || typeof answer.period === 'string') &&
    (answer.provider === 'groq' || answer.provider === 'lmstudio') &&
    typeof answer.model === 'string' &&
    (answer.mode === 'model' || answer.mode === 'deterministic_fallback')
  );
}

function pageTitle(pathname: string): string {
  if (/^\/institutions\/[^/]+$/.test(pathname)) return 'Institution reporting history';
  if (/^\/exceptions\/[^/]+$/.test(pathname)) return 'Review-signal detail';
  if (/^\/documents\/[^/]+$/.test(pathname)) return 'Document source preview';
  const titles: Record<string, string> = {
    '/': 'Executive overview',
    '/institutions': 'Institution directory',
    '/analytics': 'Supervisory analytics',
    '/exceptions': 'Exceptions and review signals',
    '/reports': 'Custom reports',
    '/data-explorer': 'Data Explorer',
    '/assistant': 'AI supervisory assistant',
    '/agents': 'Multi-agent supervision',
    '/search': 'Search workspace',
    '/system-health': 'Integrations and system health',
    '/settings': 'Administration and settings',
  };
  return titles[pathname] ?? 'Supervisory workspace';
}

function readPageFilters(search: string): Record<string, string> {
  const params = new URLSearchParams(search);
  const filters: Record<string, string> = {};
  for (const key of FILTER_KEYS) {
    const value = params.get(key)?.trim();
    if (value) filters[key] = value.slice(0, 100);
  }
  return filters;
}

function responseError(payload: unknown): string {
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'error' in payload &&
    typeof payload.error === 'string'
  ) {
    return payload.error;
  }
  return 'The contextual assistant could not complete the request.';
}

export function PageAssistant() {
  const pathname = usePathname() ?? '/';
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const contextKey = `${pathname}?${search}`;
  const [isOpen, setIsOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const controllerRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    controllerRef.current?.abort();
    setTurns([]);
    setError(null);
    setQuestion('');
    setConfirmed(false);
    setBusy(false);
  }, [contextKey]);

  useEffect(() => {
    if (!isOpen) return;
    inputRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  async function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!confirmed || trimmed.length < 2 || busy) return;

    const history = turns.slice(-1).flatMap((turn) => [
      { role: 'user' as const, content: turn.question },
      ...(turn.result
        ? [{ role: 'assistant' as const, content: turn.result.answer }]
        : []),
    ]).slice(-2);
    const turnIndex = turns.length;
    setTurns((previous) => [...previous, { question: trimmed }]);
    setQuestion('');
    setError(null);
    setBusy(true);
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      const response = await fetch('/api/assistant/contextual-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          question: trimmed,
          pathname,
          filters: readPageFilters(search),
          history,
          syntheticOnlyConfirmed: confirmed,
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(responseError(payload));
      }
      if (!isAssistantAnswer(payload)) {
        throw new Error('The assistant returned an invalid response.');
      }
      setTurns((previous) => previous.map((turn, index) =>
        index === turnIndex ? { ...turn, result: payload } : turn,
      ));
    } catch (requestError) {
      if (requestError instanceof Error && requestError.name === 'AbortError') return;
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'The contextual assistant could not complete the request.',
      );
      setTurns((previous) => previous.filter((_, index) => index !== turnIndex));
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setBusy(false);
      }
    }
  }

  function closePanel() {
    setIsOpen(false);
    launcherRef.current?.focus();
  }

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        className="page-assistant-launcher"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(true)}
      >
        <span aria-hidden="true">✦</span>
        Ask page assistant
      </button>
      {isOpen && (
        <div className="page-assistant-layer">
          <button
            type="button"
            className="page-assistant-backdrop"
            aria-label="Close page assistant"
            onClick={closePanel}
          />
          <section
            className="page-assistant-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="page-assistant-title"
            aria-describedby="page-assistant-description"
          >
            <header className="page-assistant-header">
              <div>
                <p className="page-assistant-eyebrow">Contextual supervisory assistant</p>
                <h2 id="page-assistant-title">Ask about this page</h2>
                <p id="page-assistant-description">
                  Context: {pageTitle(pathname)}
                  {search ? ' · current filters' : ''}
                </p>
              </div>
              <button
                type="button"
                className="page-assistant-close"
                aria-label="Close assistant"
                onClick={closePanel}
              >
                ×
              </button>
            </header>
            <div className="page-assistant-data-note">
              Uses server-derived synthetic aggregates only. No document text, source rows,
              credentials, or record identifiers are sent to the configured AI service.
            </div>
            <div className="page-assistant-thread" aria-live="polite">
              {turns.length === 0 && (
                <p className="page-assistant-empty">
                  Ask a specific question about the current page, such as a trend, ratio,
                  reporting gap, or review-signal pattern.
                </p>
              )}
              {turns.map((turn, index) => (
                <article className="page-assistant-turn" key={`${contextKey}-${index}`}>
                  <div className="page-assistant-question">
                    <span>You</span>
                    <p>{turn.question}</p>
                  </div>
                  {turn.result && (
                    <div className="page-assistant-answer">
                      <div className="page-assistant-answer-meta">
                        <span>{turn.result.mode === 'model' ? 'AI answer' : 'Grounded fallback'}</span>
                      </div>
                      <p>{turn.result.answer}</p>
                      {turn.result.citations.length > 0 && (
                        <details className="page-assistant-evidence">
                          <summary>Evidence used · {turn.result.citations.length}</summary>
                          <ul>
                            {turn.result.citations.map((fact) => (
                              <li key={fact.id}>
                                <strong>[{fact.id}] {fact.label}</strong>
                                <span>{fact.value}</span>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                      <p className="page-assistant-scope">
                        {turn.result.contextScope}
                        {turn.result.period ? ` · ${turn.result.period}` : ''}
                      </p>
                    </div>
                  )}
                </article>
              ))}
              {busy && <p className="page-assistant-loading">Checking the current page evidence…</p>}
              {error && <p className="page-assistant-error" role="alert">{error}</p>}
            </div>
            <form className="page-assistant-form" onSubmit={submitQuestion}>
              <label htmlFor="page-assistant-question">Your question</label>
              <textarea
                ref={inputRef}
                id="page-assistant-question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Ask a clear, page-specific question…"
                minLength={2}
                maxLength={500}
                required
              />
              <label className="page-assistant-consent">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                <span>
                  I confirm this question and dashboard use synthetic training data only.
                  Do not enter real supervisory, personal, or confidential information.
                </span>
              </label>
              <div className="page-assistant-form-footer">
                <span>On-demand · no answer history is stored</span>
                <button
                  type="submit"
                  className="button-primary"
                  disabled={!confirmed || question.trim().length < 2 || busy}
                >
                  {busy ? 'Analyzing…' : 'Ask assistant'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}

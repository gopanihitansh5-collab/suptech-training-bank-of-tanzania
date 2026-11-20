'use client';

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { AssistantCharts } from './assistant-charts';

type ToolName =
  | 'get_portfolio_overview'
  | 'list_exceptions'
  | 'get_institution'
  | 'get_analytics'
  | 'list_institutions'
  | 'rank_institutions'
  | 'compare_institutions'
  | 'search_corpus';

const toolNames = new Set<ToolName>([
  'get_portfolio_overview',
  'list_exceptions',
  'get_institution',
  'get_analytics',
  'list_institutions',
  'rank_institutions',
  'compare_institutions',
  'search_corpus',
]);

interface AssistantPlan {
  tool: ToolName;
  arguments: Record<string, unknown>;
  purpose: string;
  source: string;
  confirmation: string;
  inferred?: Record<string, string>;
}

interface NarrativeFact {
  label: string;
  value: string;
  detail?: string;
}

interface AssistantNarrative {
  headline: string;
  summary: string;
  detail: string;
  facts: NarrativeFact[];
  followUps: string[];
}

interface ToolResult {
  tool: ToolName;
  arguments: Record<string, unknown>;
  result: unknown;
  summary: string;
  narrative?: AssistantNarrative;
}

interface ConversationEntry {
  role: 'user' | 'assistant';
  content: string;
}

interface GroundedSource {
  kind: 'document' | 'report' | 'institution' | 'exception';
  id: string;
  title: string;
  excerpt: string;
  citation: Record<string, unknown>;
}

interface GroundedAnswer {
  status: 'answered' | 'no_evidence' | 'unavailable';
  text: string;
  error?: string;
  citations: Array<{
    sourceId: string;
    title: string;
    kind: GroundedSource['kind'];
    citation: Record<string, unknown>;
  }>;
}

interface GroundedResult {
  retrievalMode: 'hybrid' | 'keyword';
  fallbackReason?: string;
  hits: GroundedSource[];
  answer: GroundedAnswer;
}

interface AssistantCompletion {
  type: 'institution' | 'indicator' | 'period' | 'question';
  value: string;
  label: string;
}

interface AssistantSuggestionSet {
  generatedAt: string;
  suggestions: string[];
  completions: AssistantCompletion[];
}

const completionTypes = new Set<AssistantCompletion['type']>([
  'institution',
  'indicator',
  'period',
  'question',
]);

function isCompletion(value: unknown): value is AssistantCompletion {
  return (
    isRecord(value) &&
    typeof value.type === 'string' &&
    completionTypes.has(value.type as AssistantCompletion['type']) &&
    typeof value.value === 'string' &&
    typeof value.label === 'string'
  );
}

function isSuggestionSet(value: unknown): value is AssistantSuggestionSet {
  return (
    isRecord(value) &&
    typeof value.generatedAt === 'string' &&
    Array.isArray(value.suggestions) &&
    value.suggestions.every((suggestion) => typeof suggestion === 'string') &&
    Array.isArray(value.completions) &&
    value.completions.every(isCompletion)
  );
}

async function fetchSuggestionSet(query: string): Promise<AssistantSuggestionSet | null> {
  try {
    const suffix = query ? `?q=${encodeURIComponent(query)}` : '';
    const response = await fetch(`/api/assistant/suggestions${suffix}`, { cache: 'no-store' });
    if (!response.ok) return null;
    const payload: unknown = await response.json().catch(() => null);
    return isSuggestionSet(payload) ? payload : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAssistantPlan(value: unknown): value is AssistantPlan {
  if (!isRecord(value) || !isRecord(value.arguments)) return false;
  return (
    typeof value.tool === 'string' &&
    toolNames.has(value.tool as ToolName) &&
    typeof value.purpose === 'string' &&
    typeof value.source === 'string' &&
    typeof value.confirmation === 'string' &&
    (value.inferred === undefined ||
      (isRecord(value.inferred) &&
        Object.values(value.inferred).every((entry) => typeof entry === 'string')))
  );
}

function isNarrative(value: unknown): value is AssistantNarrative {
  if (!isRecord(value)) return false;
  if (
    typeof value.headline !== 'string' ||
    typeof value.summary !== 'string' ||
    typeof value.detail !== 'string'
  ) {
    return false;
  }
  if (!Array.isArray(value.facts) || !Array.isArray(value.followUps)) return false;
  return (
    value.facts.every((fact) =>
      isRecord(fact) &&
      typeof fact.label === 'string' &&
      typeof fact.value === 'string' &&
      (fact.detail === undefined || typeof fact.detail === 'string'),
    ) &&
    value.followUps.every((followUp) => typeof followUp === 'string')
  );
}

function isToolResult(value: unknown): value is ToolResult {
  if (!isRecord(value) || !isRecord(value.arguments)) return false;
  return (
    typeof value.tool === 'string' &&
    toolNames.has(value.tool as ToolName) &&
    typeof value.summary === 'string' &&
    (value.narrative === undefined || isNarrative(value.narrative))
  );
}

function readableLabel(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not available';
  if (Array.isArray(value)) return value.map(displayValue).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function EvidenceValue({ label, value }: { label: string; value: unknown }) {
  if (Array.isArray(value)) {
    const records = value.filter(isRecord);
    if (records.length > 0) {
      const columns = Object.keys(records[0]).slice(0, 7);
      return (
        <section className="assistant-evidence-section">
          <h4>{readableLabel(label)}</h4>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>{columns.map((column) => <th key={column}>{readableLabel(column)}</th>)}</tr>
              </thead>
              <tbody>
                {records.slice(0, 10).map((record, rowIndex) => (
                  <tr key={String(record.id ?? record.reportId ?? record.institutionId ?? rowIndex)}>
                    {columns.map((column) => (
                      <td key={column}>{displayValue(record[column])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {records.length > 10 && (
            <p className="panel-caption">Showing 10 of {records.length} returned records.</p>
          )}
        </section>
      );
    }
    return (
      <section className="assistant-evidence-section">
        <h4>{readableLabel(label)}</h4>
        <p>{displayValue(value)}</p>
      </section>
    );
  }

  if (isRecord(value)) {
    const entries = Object.entries(value);
    const scalarEntries = entries.filter(([, entry]) => !isRecord(entry) && !Array.isArray(entry));
    const nestedEntries = entries.filter(([, entry]) => isRecord(entry) || Array.isArray(entry));
    return (
      <section className="assistant-evidence-section">
        <h4>{readableLabel(label)}</h4>
        {scalarEntries.length > 0 && (
          <dl className="assistant-evidence-list">
            {scalarEntries.map(([key, entry]) => (
              <div key={key}>
                <dt>{readableLabel(key)}</dt>
                <dd>{displayValue(entry)}</dd>
              </div>
            ))}
          </dl>
        )}
        {nestedEntries.map(([key, entry]) => (
          <EvidenceValue key={key} label={key} value={entry} />
        ))}
      </section>
    );
  }

  return (
    <section className="assistant-evidence-section">
      <h4>{readableLabel(label)}</h4>
      <p>{displayValue(value)}</p>
    </section>
  );
}

function EvidenceView({ result }: { result: ToolResult }) {
  if (result.tool === 'search_corpus' && isGroundedResult(result.result)) {
    return <GroundedEvidence result={result.result} />;
  }
  if (!isRecord(result.result)) {
    return <p className="assistant-evidence-empty">No matching records were returned.</p>;
  }
  return (
    <div className="assistant-evidence">
      {Object.entries(result.result).map(([key, value]) => (
        <EvidenceValue key={key} label={key} value={value} />
      ))}
    </div>
  );
}

function NarrativeView({
  narrative,
  result,
  onFollowUp,
  busy,
}: {
  narrative: AssistantNarrative;
  result: ToolResult;
  onFollowUp: (question: string) => void;
  busy: boolean;
}) {
  return (
    <div className="assistant-narrative">
      <p className="assistant-narrative-summary">{narrative.summary}</p>
      {narrative.detail && (
        <p className="assistant-narrative-detail">{narrative.detail}</p>
      )}
      {narrative.facts.length > 0 && (
        <dl className="assistant-plan-details assistant-narrative-facts">
          {narrative.facts.map((fact, index) => (
            <div key={`${fact.label}-${index}`}>
              <dt>{fact.label}</dt>
              <dd>
                {fact.value}
                {fact.detail && <span className="panel-caption">{fact.detail}</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {narrative.followUps.length > 0 && (
        <div className="assistant-suggestions" aria-label="Suggested follow-up questions">
          {narrative.followUps.map((followUp) => (
            <button
              type="button"
              className="assistant-suggestion"
              key={followUp}
              onClick={() => onFollowUp(followUp)}
              disabled={busy}
            >
              {followUp}
            </button>
          ))}
        </div>
      )}
      <AssistantCharts tool={result.tool} result={result.result} />
      <section className="assistant-narrative-evidence" aria-label="Source records">
        <h3 className="assistant-evidence-heading">Source records</h3>
        <EvidenceView result={result} />
      </section>
    </div>
  );
}


function isGroundedResult(value: unknown): value is GroundedResult {
  if (!isRecord(value) || !Array.isArray(value.hits) || !isRecord(value.answer)) return false;
  return (
    (value.retrievalMode === 'hybrid' || value.retrievalMode === 'keyword') &&
    typeof value.answer.status === 'string' &&
    typeof value.answer.text === 'string' &&
    Array.isArray(value.answer.citations)
  );
}

function sourceHref(source: GroundedSource): string {
  const citation = source.citation;
  if (
    source.kind === 'document' &&
    typeof citation.documentId === 'string' &&
    typeof citation.chunkIndex === 'number'
  ) {
    return `/documents/${encodeURIComponent(citation.documentId)}?chunk=${citation.chunkIndex}`;
  }
  if (source.kind === 'exception' && typeof citation.exceptionId === 'string') {
    return `/exceptions?search=${encodeURIComponent(citation.exceptionId)}`;
  }
  if (source.kind === 'report' && typeof citation.period === 'string') {
    return `/reports?period=${encodeURIComponent(citation.period)}`;
  }
  if (typeof citation.institutionId === 'string') {
    return `/institutions/${encodeURIComponent(citation.institutionId)}`;
  }
  return '/search';
}

function GroundedEvidence({ result }: { result: GroundedResult }) {
  return (
    <div className="grounded-answer">
      <div className="grounded-answer-header">
        <span className="dataset-layer">
          {result.retrievalMode === 'hybrid' ? 'Search complete · related matches included' : 'Search complete'}
        </span>
        <span className="panel-caption">{result.hits.length} source(s)</span>
      </div>
      {result.fallbackReason && (
        <p className="grounded-fallback" role="status">{result.fallbackReason}</p>
      )}
      <section className={`grounded-response grounded-response-${result.answer.status}`}>
        <h3>Answer</h3>
        <p>{result.answer.text}</p>
        {result.answer.citations.length > 0 && (
          <div className="grounded-citations" aria-label="Sources">
            {result.answer.citations.map((citation) => (
              <a
                className="period-chip"
                href={sourceHref({
                  kind: citation.kind,
                  id: citation.sourceId,
                  title: citation.title,
                  excerpt: '',
                  citation: citation.citation,
                })}
                key={citation.sourceId}
              >
                {citation.sourceId} · {citation.title}
              </a>
            ))}
          </div>
        )}
      </section>
      <section className="grounded-sources" aria-label="Source records">
        <h3>Source records</h3>
        {result.hits.map((source, index) => (
          <article className="grounded-source" key={`${source.kind}:${source.id}`}>
            <div className="grounded-source-heading">
              <strong>[S{index + 1}] {source.title}</strong>
              <a className="table-link" href={sourceHref(source)}>Open source</a>
            </div>
            <span className="panel-caption">{readableLabel(source.kind)} · {source.id}</span>
            <p>{source.excerpt}</p>
          </article>
        ))}
        {result.hits.length === 0 && (
          <p className="assistant-evidence-empty">No matching records were found.</p>
        )}
      </section>
    </div>
  );
}

export function AssistantWorkspace() {
  const [question, setQuestion] = useState('');
  const [plan, setPlan] = useState<AssistantPlan | null>(null);
  const [result, setResult] = useState<ToolResult | null>(null);
  const [conversation, setConversation] = useState<ConversationEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [completions, setCompletions] = useState<AssistantCompletion[]>([]);
  const [completionOpen, setCompletionOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastInsertedRef = useRef('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const set = await fetchSuggestionSet('');
      if (!cancelled && set) setSuggestions(set.suggestions);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const trimmed = question.trim();
    if (trimmed.length < 2) {
      setCompletions([]);
      setCompletionOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (lastInsertedRef.current === trimmed) {
      setCompletionOpen(false);
      setActiveIndex(-1);
      return;
    }
    lastInsertedRef.current = '';
    const timer = setTimeout(() => {
      void (async () => {
        const set = await fetchSuggestionSet(trimmed);
        if (!set) return;
        const next = set.completions.slice(0, 6);
        setCompletions(next);
        setActiveIndex(-1);
        setCompletionOpen(next.length > 0 && document.activeElement === textareaRef.current);
      })();
    }, 200);
    return () => clearTimeout(timer);
  }, [question]);

  async function refreshSuggestions() {
    const set = await fetchSuggestionSet('');
    if (set) setSuggestions(set.suggestions);
  }

  function selectCompletion(completion: AssistantCompletion) {
    lastInsertedRef.current = completion.value.trim();
    setCompletionOpen(false);
    setActiveIndex(-1);
    setQuestion(completion.value);
    if (completion.type === 'question') {
      void createPlan(completion.value);
      return;
    }
    textareaRef.current?.focus();
  }

  function handleQuestionKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!completionOpen || completions.length === 0) {
      if (event.key === 'Escape') setCompletionOpen(false);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % completions.length);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => (current <= 0 ? completions.length - 1 : current - 1));
      return;
    }
    if (event.key === 'Enter' && activeIndex >= 0 && activeIndex < completions.length) {
      event.preventDefault();
      selectCompletion(completions[activeIndex]);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setCompletionOpen(false);
      setActiveIndex(-1);
    }
  }

  async function createPlan(value: string) {
    const trimmed = value.trim();
    if (trimmed.length < 2 || busy) return;
    setBusy(true);
    setError('');
    setPlan(null);
    setResult(null);
    setQuestion(trimmed);
    setConversation((current) => [...current, { role: 'user', content: trimmed }]);
    try {
      const response = await fetch('/api/assistant/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError(
          isRecord(payload) && typeof payload.error === 'string'
            ? payload.error
            : 'The query plan could not be created.',
        );
        return;
      }
      if (!isRecord(payload) || !isAssistantPlan(payload.plan)) {
        setError('The assistant returned an unexpected response.');
        return;
      }
      const nextPlan = payload.plan;
      setPlan(nextPlan);
      setConversation((current) => [
        ...current,
        { role: 'assistant', content: `Proposed: ${nextPlan.purpose}` },
      ]);
    } catch {
      setError('The assistant could not be reached. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function executePlan() {
    if (!plan || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/assistant/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: plan.tool, arguments: plan.arguments }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError(
          isRecord(payload) && typeof payload.error === 'string'
            ? payload.error
            : 'The read-only query could not be executed.',
        );
        return;
      }
      if (!isRecord(payload) || !isToolResult(payload.result)) {
        setError('The query returned an invalid response.');
        return;
      }
      const toolResult = payload.result;
      setResult(toolResult);
      setConversation((current) => [
        ...current,
        { role: 'assistant', content: toolResult.narrative?.headline ?? toolResult.summary },
      ]);
      void refreshSuggestions();
    } catch {
      setError('The records service could not be reached. Try again.');
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void createPlan(question);
  }

  return (
    <div className="assistant-workspace">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Ask about synthetic records</h2>
            <p className="panel-caption">
              The assistant only reads records. Review the request before running it.
            </p>
          </div>
          <span className="period-chip">Read only</span>
        </div>
        <div className="panel-body">
          <div className="assistant-suggestions" aria-label="Suggested questions">
            {suggestions.map((suggestion) => (
              <button
                type="button"
                className="assistant-suggestion"
                key={suggestion}
                onClick={() => void createPlan(suggestion)}
                disabled={busy}
              >
                {suggestion}
              </button>
            ))}
          </div>
          <form className="assistant-question-form" onSubmit={handleSubmit}>
            <label className="sr-only" htmlFor="assistant-question">Your question</label>
            <textarea
              id="assistant-question"
              ref={textareaRef}
              className="assistant-question-input"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={handleQuestionKeyDown}
              onFocus={() => {
                const trimmed = question.trim();
                if (
                  completions.length > 0 &&
                  trimmed.length >= 2 &&
                  lastInsertedRef.current !== trimmed
                ) {
                  setCompletionOpen(true);
                }
              }}
              onBlur={() => {
                window.setTimeout(() => setCompletionOpen(false), 120);
              }}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={completionOpen}
              aria-controls="assistant-completion-list"
              aria-haspopup="listbox"
              aria-activedescendant={
                completionOpen && activeIndex >= 0
                  ? `assistant-completion-${activeIndex}`
                  : undefined
              }
              maxLength={200}
              minLength={2}
              placeholder="For example: Show high-severity open exceptions for 2026-10"
              required
            />
            {completionOpen && completions.length > 0 && (
              <ul
                id="assistant-completion-list"
                className="assistant-completions"
                role="listbox"
                aria-label="Question completions"
                style={{
                  margin: '6px 0 0',
                  padding: 4,
                  listStyle: 'none',
                  border: '1px solid var(--line)',
                  borderRadius: 10,
                  background: 'var(--card)',
                  boxShadow: '0 8px 20px rgba(16, 29, 53, 0.08)',
                }}
              >
                {completions.map((completion, index) => (
                  <li
                    key={`${completion.type}:${completion.value}:${index}`}
                    id={`assistant-completion-${index}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    tabIndex={-1}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectCompletion(completion)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '7px 9px',
                      borderRadius: 7,
                      cursor: 'pointer',
                      background: index === activeIndex ? 'var(--teal-soft)' : 'transparent',
                    }}
                  >
                    <span
                      className="assistant-completion-type"
                      style={{
                        minWidth: 58,
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '.06em',
                        textTransform: 'uppercase',
                        color: 'var(--muted)',
                      }}
                    >
                      {completion.type}
                    </span>
                    <span>{completion.label}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="assistant-question-footer">
              <span className="panel-caption">{question.length}/200 characters</span>
              <button className="button-primary" type="submit" disabled={busy || question.trim().length < 2}>
                {busy ? 'Working...' : 'Create query plan'}
              </button>
            </div>
          </form>
        </div>
      </section>

      {error && <div className="form-error" role="alert">{error}</div>}

      {conversation.length > 0 && (
        <section className="panel" aria-label="Current-session conversation">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Current session</h2>
              <p className="panel-caption">Conversation is held in this browser session only.</p>
            </div>
            <button
              type="button"
              className="assistant-clear"
              onClick={() => {
                setConversation([]);
                setPlan(null);
                setResult(null);
                setError('');
                setQuestion('');
              }}
            >
              Clear
            </button>
          </div>
          <ol className="assistant-conversation">
            {conversation.map((entry, index) => (
              <li className={`assistant-message ${entry.role}`} key={`${entry.role}-${index}`}>
                <span className="assistant-message-role">{entry.role === 'user' ? 'You' : 'Assistant'}</span>
                <p>{entry.content}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {plan && !result && (
        <section className="panel assistant-plan" aria-labelledby="assistant-plan-title">
          <div className="panel-header">
            <div>
              <div className="eyebrow">Review before execution</div>
              <h2 className="panel-title" id="assistant-plan-title">{plan.purpose}</h2>
            </div>
            <span className="period-chip">{plan.tool.replaceAll('_', ' ')}</span>
          </div>
          <div className="panel-body">
            <dl className="assistant-plan-details">
              <div><dt>Data source</dt><dd>{plan.source}</dd></div>
              <div><dt>Details</dt><dd><code>{JSON.stringify(plan.arguments)}</code></dd></div>
              <div><dt>Confirmation</dt><dd>{plan.confirmation}</dd></div>
            </dl>
            {plan.inferred && Object.keys(plan.inferred).length > 0 && (
              <p className="panel-caption">
                Auto-filled context:{' '}
                {Object.entries(plan.inferred)
                  .map(([key, value]) => `${readableLabel(key)}: ${value}`)
                  .join(' · ')}
              </p>
            )}
            <button className="button-primary" type="button" onClick={() => void executePlan()} disabled={busy}>
              {busy ? 'Running...' : 'Run this read-only query'}
            </button>
          </div>
        </section>
      )}

      {result && (
        <section className="panel assistant-answer" aria-labelledby="assistant-answer-title">
          <div className="panel-header">
            <div>
              <div className="eyebrow">Evidence-backed result</div>
              <h2 className="panel-title" id="assistant-answer-title">
                {result.narrative?.headline ?? result.summary}
              </h2>
            </div>
            <span className="period-chip">Synthetic records</span>
          </div>
          <div className="panel-body">
            {result.narrative ? (
              <NarrativeView
                narrative={result.narrative}
                result={result}
                onFollowUp={(followUp) => void createPlan(followUp)}
                busy={busy}
              />
            ) : (
              <>
                <AssistantCharts tool={result.tool} result={result.result} />
                <EvidenceView result={result} />
              </>
            )}
            <p className="assistant-limit">
              This result reflects only the returned synthetic records. Review the source period and records;
              it is not an official assessment.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

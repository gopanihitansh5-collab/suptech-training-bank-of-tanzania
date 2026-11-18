'use client';

import { useState, type FormEvent } from 'react';

type ToolName =
  | 'get_portfolio_overview'
  | 'list_exceptions'
  | 'get_institution'
  | 'get_analytics'
  | 'list_institutions';

const toolNames = new Set<ToolName>([
  'get_portfolio_overview',
  'list_exceptions',
  'get_institution',
  'get_analytics',
  'list_institutions',
]);

interface AssistantPlan {
  tool: ToolName;
  arguments: Record<string, unknown>;
  purpose: string;
  source: string;
  confirmation: string;
}

interface ToolResult {
  tool: ToolName;
  arguments: Record<string, unknown>;
  result: unknown;
  summary: string;
}

interface ConversationEntry {
  role: 'user' | 'assistant';
  content: string;
}

const suggestions = [
  'Summarize the portfolio for 2026-10',
  'Show high-severity open exceptions for 2026-10',
  'Explain synthetic institution TZ004',
  'Show NPL ratio analytics for 2026-10',
  'List synthetic institutions',
];

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
    typeof value.confirmation === 'string'
  );
}

function isToolResult(value: unknown): value is ToolResult {
  if (!isRecord(value) || !isRecord(value.arguments)) return false;
  return (
    typeof value.tool === 'string' &&
    toolNames.has(value.tool as ToolName) &&
    typeof value.summary === 'string'
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
  if (!isRecord(result.result)) {
    return <p className="assistant-evidence-empty">No structured evidence was returned.</p>;
  }
  return (
    <div className="assistant-evidence">
      {Object.entries(result.result).map(([key, value]) => (
        <EvidenceValue key={key} label={key} value={value} />
      ))}
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
        setError('The planner returned an invalid response.');
        return;
      }
      const nextPlan = payload.plan;
      setPlan(nextPlan);
      setConversation((current) => [
        ...current,
        { role: 'assistant', content: `Proposed: ${nextPlan.purpose}` },
      ]);
    } catch {
      setError('The local planner could not be reached. Retry the request.');
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
        { role: 'assistant', content: toolResult.summary },
      ]);
    } catch {
      setError('The query service could not be reached. Check the local database and retry.');
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
              The planner selects only an allowlisted read operation. Review the plan before execution.
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
              className="assistant-question-input"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              maxLength={200}
              minLength={2}
              placeholder="For example: Show high-severity open exceptions for 2026-10"
              required
            />
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
                <span className="assistant-message-role">{entry.role === 'user' ? 'You' : 'Planner'}</span>
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
              <div><dt>Arguments</dt><dd><code>{JSON.stringify(plan.arguments)}</code></dd></div>
              <div><dt>Confirmation</dt><dd>{plan.confirmation}</dd></div>
            </dl>
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
              <h2 className="panel-title" id="assistant-answer-title">{result.summary}</h2>
            </div>
            <span className="period-chip">Synthetic records</span>
          </div>
          <div className="panel-body">
            <EvidenceView result={result} />
            <p className="assistant-limit">
              This result reflects only the returned synthetic records. Review the source period and evidence;
              it is not an official assessment.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

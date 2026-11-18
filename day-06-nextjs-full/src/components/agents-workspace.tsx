'use client';

import { useState, type FormEvent } from 'react';

export interface AgentSummary {
  id: string;
  name: string;
  description: string;
}

interface AgentResponse {
  success: boolean;
  agentId: string;
  agentName: string;
  response?: string;
  error?: string;
  latencyMs?: number;
}

interface OrchestrationResult {
  success: boolean;
  agents: AgentResponse[];
  totalLatencyMs: number;
  error?: string;
}

const MAX_MESSAGE_LENGTH = 2000;

function isOrchestrationResult(value: unknown): value is OrchestrationResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<OrchestrationResult>;
  return (
    typeof result.success === 'boolean' &&
    Array.isArray(result.agents) &&
    typeof result.totalLatencyMs === 'number'
  );
}

function responseError(value: unknown): string {
  if (
    value &&
    typeof value === 'object' &&
    'error' in value &&
    typeof value.error === 'string'
  ) {
    return value.error;
  }
  return 'The local analysis request could not be completed.';
}

export function AgentsWorkspace({ availableAgents }: { availableAgents: AgentSummary[] }) {
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  const [userMessage, setUserMessage] = useState('');
  const [result, setResult] = useState<OrchestrationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [parallel, setParallel] = useState(true);

  function toggleAgent(agentId: string) {
    setSelectedAgents((previous) => {
      const next = new Set(previous);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
      return next;
    });
    setResult(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = userMessage.trim();
    if (selectedAgents.size === 0 || message.length < 2 || loading) return;

    setLoading(true);
    setResult(null);
    try {
      const response = await fetch('/api/orchestration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: Array.from(selectedAgents, (agentId) => ({
            agentId,
            userMessage: message,
          })),
          parallel,
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setResult({
          success: false,
          agents: [],
          totalLatencyMs: 0,
          error: responseError(payload),
        });
      } else if (isOrchestrationResult(payload)) {
        setResult(payload);
      } else {
        setResult({
          success: false,
          agents: [],
          totalLatencyMs: 0,
          error: 'The local analysis service returned an invalid response.',
        });
      }
    } catch {
      setResult({
        success: false,
        agents: [],
        totalLatencyMs: 0,
        error: 'The local analysis service could not be reached. Check the local model and retry.',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="agent-workspace">
      <section aria-labelledby="agent-selection-title">
        <div className="agent-section-heading">
          <div>
            <h2 className="panel-title" id="agent-selection-title">Choose analysis roles</h2>
            <p className="panel-caption">Keep each request focused. Selected roles receive the same prompt.</p>
          </div>
          <span className="period-chip">{selectedAgents.size} selected</span>
        </div>
        <div className="agent-grid">
          {availableAgents.map((agent) => {
            const selected = selectedAgents.has(agent.id);
            return (
              <button
                type="button"
                key={agent.id}
                className={`agent-card${selected ? ' selected' : ''}`}
                aria-pressed={selected}
                onClick={() => toggleAgent(agent.id)}
              >
                <span className="agent-card-heading">
                  <span className="agent-indicator" aria-hidden="true">{selected ? '✓' : ''}</span>
                  <span className="agent-name">{agent.name}</span>
                </span>
                <span className="agent-description">{agent.description}</span>
              </button>
            );
          })}
        </div>
      </section>

      <form className="panel agent-prompt-panel" onSubmit={handleSubmit}>
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Prompt the local model</h2>
            <p className="panel-caption">Use fictional examples only. Do not include real institution or personal data.</p>
          </div>
        </div>
        <div className="panel-body agent-prompt-body">
          <label className="agent-message-label" htmlFor="agent-message">Analysis request</label>
          <textarea
            id="agent-message"
            className="agent-message-input"
            value={userMessage}
            onChange={(event) => {
              setUserMessage(event.target.value);
              setResult(null);
            }}
            placeholder="Ask for a bounded explanation of a synthetic example..."
            maxLength={MAX_MESSAGE_LENGTH}
            minLength={2}
            required
          />
          <div className="agent-prompt-footer">
            <span className="panel-caption">{userMessage.length}/{MAX_MESSAGE_LENGTH} characters</span>
            <div className="agent-prompt-actions">
              <div className="agent-mode" role="group" aria-label="Execution mode">
                <button
                  type="button"
                  aria-pressed={parallel}
                  className={parallel ? 'selected' : ''}
                  onClick={() => setParallel(true)}
                >
                  Parallel
                </button>
                <button
                  type="button"
                  aria-pressed={!parallel}
                  className={!parallel ? 'selected' : ''}
                  onClick={() => setParallel(false)}
                >
                  Sequential
                </button>
              </div>
              <button
                className="button-primary"
                type="submit"
                disabled={selectedAgents.size === 0 || userMessage.trim().length < 2 || loading}
              >
                {loading ? 'Analyzing...' : 'Run selected roles'}
              </button>
            </div>
          </div>
        </div>
      </form>

      <div aria-live="polite" aria-busy={loading}>
        {loading && (
          <section className="panel agent-loading" role="status">
            <span className="agent-loading-indicator" aria-hidden="true" />
            <span>Waiting for the local model…</span>
          </section>
        )}
        {result && (
          <section className="agent-results" aria-labelledby="agent-results-title">
            <div className="agent-section-heading">
              <div>
                <h2 className="panel-title" id="agent-results-title">Analysis responses</h2>
                <p className="panel-caption">
                  {result.agents.length} role(s) · {result.totalLatencyMs} ms
                </p>
              </div>
              <span className={`status-pill${result.success ? '' : ' agent-failed-pill'}`}>
                {result.success ? 'Complete' : 'Needs attention'}
              </span>
            </div>
            {result.error && <p className="form-error" role="alert">{result.error}</p>}
            <div className="agent-result-grid">
              {result.agents.map((agent) => (
                <article className="panel agent-result-card" key={agent.agentId}>
                  <div className="panel-header">
                    <h3 className="panel-title">{agent.agentName}</h3>
                    <span className={`severity-pill ${agent.success ? 'severity-low' : 'severity-high'}`}>
                      {agent.success ? 'Response' : 'Failed'}
                    </span>
                  </div>
                  <div className="panel-body">
                    <p className="agent-response" role={agent.success ? undefined : 'alert'}>
                      {agent.success ? agent.response : agent.error}
                    </p>
                    <p className="panel-caption">Response time · {agent.latencyMs ?? 0} ms</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

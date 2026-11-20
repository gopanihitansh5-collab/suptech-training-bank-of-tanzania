'use client';

import { useState, type FormEvent } from 'react';
import { AgentsCharts } from './agents-charts';
import { WorkflowNodeGraph } from './workflow-node-graph';

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

interface VerificationCheck {
  name: string;
  status: 'passed' | 'warning' | 'failed';
  detail: string;
}

interface VerificationReport {
  verified: boolean;
  checks: VerificationCheck[];
  notes?: string;
}

interface ResponseCard {
  title: string;
  value: string;
  caption?: string;
  badge?: string;
}

interface ResponseCitation {
  id: string;
  title: string;
  excerpt: string;
  reference: string;
  kind?: string;
}

interface SupervisoryWorkflowResult {
  requestId: string;
  intent: string;
  scope: {
    institutionId?: string;
    institutionName?: string;
    period?: string;
    indicatorId?: string;
    region?: string;
    tier?: string;
    status?: string;
  };
  activeAgents: string[];
  plan: {
    workflowType: string;
    steps: string[];
    description: string;
  };
  retrievedSources?: Array<{
    id: string;
    title: string;
    excerpt: string;
    kind: string;
    citation: Record<string, unknown>;
    rank?: number;
  }>;
  analyticalResults?: Record<string, unknown>;
  verification: VerificationReport;
  response: {
    executiveSummary: string;
    detail: string;
    dataCards?: ResponseCard[];
    citations?: ResponseCitation[];
    disclaimer: string;
  };
  latencyMs: number;
  modelUsed: string;
  modelProvider?: string;
  facts?: unknown;
}

const MAX_MESSAGE_LENGTH = 2000;

const SUGGESTED_WORKFLOWS = [
  {
    title: 'Portfolio & NPL Trends',
    question: 'Analyze portfolio deposits and NPL trends for 2026-10',
    period: '2026-10',
    intent: 'analytical',
  },
  {
    title: 'Investigate TZ004 Exceptions',
    question: 'Investigate high-severity exceptions for TZ004 and explain breach evidence',
    institutionId: 'TZ004',
    intent: 'exception_explanation',
  },
  {
    title: 'Reporting Rules & Guidance',
    question: 'Explain reporting rules and compliance status according to supervisory guidelines',
    intent: 'combined',
  },
  {
    title: 'Capital Adequacy Standard',
    question: 'What are the minimum capital adequacy ratio requirements according to regulatory circulars?',
    intent: 'document',
  },
  {
    title: 'Supervisory Summary Report',
    question: 'Generate comprehensive supervisory summary report for 2026-10',
    period: '2026-10',
    intent: 'report',
  },
];

function isOrchestrationResult(value: unknown): value is OrchestrationResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<OrchestrationResult>;
  return (
    typeof result.success === 'boolean' &&
    Array.isArray(result.agents) &&
    typeof result.totalLatencyMs === 'number'
  );
}

function isWorkflowResult(value: unknown): value is SupervisoryWorkflowResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<SupervisoryWorkflowResult>;
  return (
    typeof result.requestId === 'string' &&
    typeof result.intent === 'string' &&
    Array.isArray(result.activeAgents) &&
    Boolean(result.plan) &&
    Boolean(result.verification) &&
    Boolean(result.response)
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
  return 'The supervisory analysis request could not be completed.';
}

interface WorkflowFact {
  label: string;
  value: string;
  detail?: string;
}

interface FollowUpChip {
  label: string;
  question: string;
  period?: string;
  institutionId?: string;
}

function narrowFacts(value: unknown): WorkflowFact[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as Record<string, unknown>;
    if (typeof record.label !== 'string' || typeof record.value !== 'string') return [];
    return [
      {
        label: record.label,
        value: record.value,
        detail: typeof record.detail === 'string' ? record.detail : undefined,
      },
    ];
  });
}

function buildFollowUps(result: SupervisoryWorkflowResult): FollowUpChip[] {
  const chips: FollowUpChip[] = [];
  const institutionId = result.scope.institutionId;
  const results = result.analyticalResults;
  const hasOverview = Boolean(results && results.overview && typeof results.overview === 'object');
  const hasExceptions = Boolean(results && Array.isArray(results.exceptions) && results.exceptions.length > 0);
  const period = result.scope.period ?? '';
  const periodSuffix = period ? ` for ${period}` : '';

  if (institutionId) {
    chips.push(
      {
        label: `Show the 12-period trend for ${institutionId}`,
        question: `Show the 12-period trend for ${institutionId}`,
        institutionId,
      },
      {
        label: `Compare ${institutionId} with another institution`,
        question: `Compare ${institutionId} with another institution`,
        institutionId,
      },
      {
        label: `List open exceptions for ${institutionId}`,
        question: `List open exceptions for ${institutionId}`,
        institutionId,
      },
    );
  }

  if (hasOverview) {
    chips.push(
      {
        label: 'Which institutions have the most open exceptions?',
        question: 'Which institutions have the most open exceptions?',
      },
      {
        label: `Show the NPL ratio trend${periodSuffix}`,
        question: `Show the NPL ratio trend${periodSuffix}`,
        period: period || undefined,
      },
      {
        label: `Generate an exception report${periodSuffix}`,
        question: `Generate an exception report${periodSuffix}`,
        period: period || undefined,
      },
    );
  }

  if (hasExceptions) {
    chips.push(
      {
        label: 'Explain the highest-severity signal',
        question: 'Explain the highest-severity signal',
      },
      {
        label: 'List critical open exceptions',
        question: 'List critical open exceptions',
      },
      {
        label: 'Compare the affected institutions',
        question: 'Compare the affected institutions',
      },
    );
  }

  const seen = new Set<string>();
  return chips.filter((chip) => {
    if (seen.has(chip.question)) return false;
    seen.add(chip.question);
    return true;
  });
}

export function AgentsWorkspace({ availableAgents }: { availableAgents: AgentSummary[] }) {
  const [activeTab, setActiveTab] = useState<'workflow' | 'direct'>('workflow');

  // Workflow State
  const [workflowQuestion, setWorkflowQuestion] = useState('');
  const [workflowPeriod, setWorkflowPeriod] = useState('2026-10');
  const [workflowInstitutionId, setWorkflowInstitutionId] = useState('');
  const [workflowResult, setWorkflowResult] = useState<SupervisoryWorkflowResult | null>(null);
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [workflowSyntheticConfirmed, setWorkflowSyntheticConfirmed] = useState(false);

  // Manual Direct Prompt State
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  const [directMessage, setDirectMessage] = useState('');
  const [directResult, setDirectResult] = useState<OrchestrationResult | null>(null);
  const [directLoading, setDirectLoading] = useState(false);
  const [parallel, setParallel] = useState(true);
  const [directSyntheticConfirmed, setDirectSyntheticConfirmed] = useState(false);

  const workflowFacts = workflowResult ? narrowFacts(workflowResult.facts) : [];
  const followUps = workflowResult ? buildFollowUps(workflowResult) : [];

  // Suggested workflow click
  function applySuggestedWorkflow(suggestion: typeof SUGGESTED_WORKFLOWS[0]) {
    setWorkflowQuestion(suggestion.question);
    if (suggestion.period) setWorkflowPeriod(suggestion.period);
    if (suggestion.institutionId) setWorkflowInstitutionId(suggestion.institutionId);
    else setWorkflowInstitutionId('');
    setWorkflowResult(null);
    setWorkflowError(null);
    setWorkflowSyntheticConfirmed(false);
  }

  // Handle Workflow Execution
  async function runWorkflow(
    question: string,
    overrides?: { period?: string; institutionId?: string },
  ) {
    const query = question.trim();
    if (query.length < 2 || workflowLoading) return;

    const period = overrides?.period ?? workflowPeriod.trim();
    const institutionId = overrides?.institutionId ?? workflowInstitutionId.trim();

    setWorkflowLoading(true);
    setWorkflowError(null);
    setWorkflowResult(null);

    try {
      const response = await fetch('/api/orchestration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow: true,
          question: query,
          period: period || undefined,
          institutionId: institutionId || undefined,
          syntheticOnlyConfirmed: workflowSyntheticConfirmed,
        }),
      });

      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setWorkflowError(responseError(payload));
      } else if (isWorkflowResult(payload)) {
        setWorkflowResult(payload);
      } else {
        setWorkflowError('The supervisory workflow service returned an invalid response structure.');
      }
    } catch {
      setWorkflowError(
        'The supervisory workflow service could not be reached. Verify network connectivity and server status.'
      );
    } finally {
      setWorkflowLoading(false);
    }
  }

  async function handleWorkflowSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runWorkflow(workflowQuestion);
  }

  function applyFollowUp(chip: FollowUpChip) {
    setWorkflowQuestion(chip.question);
    if (chip.period !== undefined) setWorkflowPeriod(chip.period);
    if (chip.institutionId !== undefined) setWorkflowInstitutionId(chip.institutionId);
    setWorkflowSyntheticConfirmed(false);
    setWorkflowResult(null);
    setWorkflowError(null);
  }

  // Handle Manual Direct Prompt Submission
  function toggleAgent(agentId: string) {
    setSelectedAgents((previous) => {
      const next = new Set(previous);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
      return next;
    });
    setDirectResult(null);
  }

  async function handleDirectSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = directMessage.trim();
    if (selectedAgents.size === 0 || message.length < 2 || directLoading) return;

    setDirectLoading(true);
    setDirectResult(null);

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
          syntheticOnlyConfirmed: directSyntheticConfirmed,
        }),
      });

      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setDirectResult({
          success: false,
          agents: [],
          totalLatencyMs: 0,
          error: responseError(payload),
        });
      } else if (isOrchestrationResult(payload)) {
        setDirectResult(payload);
      } else {
        setDirectResult({
          success: false,
          agents: [],
          totalLatencyMs: 0,
          error: 'The local analysis service returned an invalid response.',
        });
      }
    } catch {
      setDirectResult({
        success: false,
        agents: [],
        totalLatencyMs: 0,
        error: 'The AI analysis service could not be reached. Check the service and retry.',
      });
    } finally {
      setDirectLoading(false);
    }
  }

  return (
    <div className="agent-workspace">
      {/* Mode Switcher Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '1px solid var(--line)',
          paddingBottom: '12px',
        }}
        role="tablist"
        aria-label="Agent Operation Modes"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'workflow'}
          onClick={() => setActiveTab('workflow')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: '1px solid',
            borderColor: activeTab === 'workflow' ? 'var(--teal)' : 'var(--line)',
            backgroundColor: activeTab === 'workflow' ? '#f0faf7' : 'white',
            color: activeTab === 'workflow' ? '#087467' : 'var(--muted)',
            fontWeight: 700,
            fontSize: '12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span style={{ fontSize: '14px' }}>⚡</span>
          <span>Supervisory Intelligence Workflow</span>
          <span
            style={{
              padding: '2px 6px',
              borderRadius: '999px',
              fontSize: '10px',
              backgroundColor: activeTab === 'workflow' ? 'var(--teal)' : '#edf2f8',
              color: activeTab === 'workflow' ? 'white' : '#64748b',
            }}
          >
            Autonomous Graph
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'direct'}
          onClick={() => setActiveTab('direct')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: '1px solid',
            borderColor: activeTab === 'direct' ? 'var(--teal)' : 'var(--line)',
            backgroundColor: activeTab === 'direct' ? '#f0faf7' : 'white',
            color: activeTab === 'direct' ? '#087467' : 'var(--muted)',
            fontWeight: 700,
            fontSize: '12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span style={{ fontSize: '14px' }}>⚙</span>
          <span>Specialist Agent Direct Prompt</span>
          <span
            style={{
              padding: '2px 6px',
              borderRadius: '999px',
              fontSize: '10px',
              backgroundColor: activeTab === 'direct' ? 'var(--teal)' : '#edf2f8',
              color: activeTab === 'direct' ? 'white' : '#64748b',
            }}
          >
            Manual Roles
          </span>
        </button>
      </div>

      {/* ==============================================================
          MODE 1: SUPERVISORY INTELLIGENCE WORKFLOW GRAPH
          ============================================================== */}
      {activeTab === 'workflow' && (
        <div style={{ display: 'grid', gap: '18px' }}>
          {/* Preset Workflows */}
          <section aria-labelledby="workflow-presets-title">
            <div className="agent-section-heading">
              <div>
                <h2 className="panel-title" id="workflow-presets-title">
                  Recommended supervisory workflows
                </h2>
                <p className="panel-caption">
                  Select a preconfigured workflow pattern or enter custom supervisory criteria.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {SUGGESTED_WORKFLOWS.map((sugg, idx) => (
                <button
                  type="button"
                  key={idx}
                  className="assistant-suggestion"
                  onClick={() => applySuggestedWorkflow(sugg)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <span style={{ fontWeight: 700, color: 'var(--teal)' }}>›</span>
                  <span>{sugg.title}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Workflow Query Form */}
          <form className="panel agent-prompt-panel" onSubmit={handleWorkflowSubmit}>
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Run a supervisory analysis</h2>
                <p className="panel-caption">
                  Automatically coordinates context, data analysis, document research, quality checks and summary writing.
                </p>
              </div>
              <span className="period-chip">Guided workflow</span>
            </div>

            <div className="panel-body agent-prompt-body">
              <label className="agent-message-label" htmlFor="workflow-question">
                Your question
              </label>
              <textarea
                id="workflow-question"
                className="agent-message-input"
                value={workflowQuestion}
                onChange={(event) => {
                  setWorkflowQuestion(event.target.value);
                  setWorkflowResult(null);
                  setWorkflowError(null);
                  setWorkflowSyntheticConfirmed(false);
                }}
                placeholder="e.g. Analyze portfolio deposits and NPL trends for 2026-10, or investigate high-severity exceptions for TZ004..."
                maxLength={MAX_MESSAGE_LENGTH}
                minLength={2}
                required
                style={{ minHeight: '90px' }}
              />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '6px' }}>
                <div>
                  <label
                    htmlFor="workflow-period"
                    style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#34425a', marginBottom: '4px' }}
                  >
                    Reporting Period (Optional)
                  </label>
                  <input
                    id="workflow-period"
                    type="text"
                    placeholder="YYYY-MM (e.g. 2026-10)"
                    value={workflowPeriod}
                    onChange={(e) => {
                      setWorkflowPeriod(e.target.value);
                      setWorkflowSyntheticConfirmed(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid #d6deea',
                      fontSize: '12px',
                    }}
                  />
                </div>
                <div>
                  <label
                    htmlFor="workflow-institution"
                    style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#34425a', marginBottom: '4px' }}
                  >
                    Institution Identifier (Optional)
                  </label>
                  <input
                    id="workflow-institution"
                    type="text"
                    placeholder="e.g. TZ001, TZ004"
                    value={workflowInstitutionId}
                    onChange={(e) => {
                      setWorkflowInstitutionId(e.target.value);
                      setWorkflowSyntheticConfirmed(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid #d6deea',
                      fontSize: '12px',
                    }}
                  />
                </div>
              </div>

              <label className="agent-synthetic-consent">
                <input
                  type="checkbox"
                  checked={workflowSyntheticConfirmed}
                  onChange={(event) => setWorkflowSyntheticConfirmed(event.target.checked)}
                />
                <span>
                  I confirm this request uses synthetic training data only. The question and
                  aggregate dashboard context may be sent to the configured AI service.
                </span>
              </label>
              <div className="agent-prompt-footer" style={{ marginTop: '12px' }}>
                <span className="panel-caption">
                  {workflowQuestion.length}/{MAX_MESSAGE_LENGTH} characters · Approved calculations are used when needed
                </span>
                <button
                  className="button-primary"
                  type="submit"
                  disabled={
                    workflowQuestion.trim().length < 2 ||
                    !workflowSyntheticConfirmed ||
                    workflowLoading
                  }
                >
                  {workflowLoading ? 'Orchestrating Workflow…' : 'Execute Supervisory Workflow'}
                </button>
              </div>
            </div>
          </form>

          {/* Workflow Error */}
          {workflowError && (
            <div className="panel" style={{ padding: '14px 18px', borderColor: '#fca5a5', backgroundColor: '#fff5f5' }}>
              <p className="form-error" role="alert" style={{ margin: 0 }}>
                {workflowError}
              </p>
            </div>
          )}

          {/* Workflow Loading Indicator */}
          {workflowLoading && (
            <section className="panel agent-loading" role="status">
              <span className="agent-loading-indicator" aria-hidden="true" />
              <span>
                Working through your question (understanding the request → gathering context → checking records → verifying → preparing the summary)…
              </span>
            </section>
          )}

          {/* Workflow Graph and Results */}
          {workflowResult && (
            <div style={{ display: 'grid', gap: '16px' }}>
              {/* Execution Graph Visualizer */}
              <section className="panel" aria-labelledby="execution-graph-title">
                <div className="panel-header">
                  <div>
                    <h3 className="panel-title" id="execution-graph-title">
                      Workflow summary
                    </h3>
                    <p className="panel-caption">
                      Request ID: <code>{workflowResult.requestId}</code> · Intent:{' '}
                      <strong style={{ textTransform: 'uppercase', color: 'var(--teal)' }}>
                        {workflowResult.intent}
                      </strong>{' '}
                      · Latency: {workflowResult.latencyMs} ms
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span className="period-chip">
                      {workflowResult.modelUsed === 'deterministic-fallback'
                        ? 'Calculated result'
                        : 'AI service'}
                    </span>
                    <span className="status-pill">Completed</span>
                  </div>
                </div>

                <div className="panel-body">
                  {workflowResult.modelUsed === 'deterministic-fallback' && (
                    <p className="panel-caption" style={{ margin: '0 0 12px' }}>
                      This answer uses approved calculations from the available records and still shows the sources.
                    </p>
                  )}
                  <WorkflowNodeGraph
                    intent={workflowResult.intent}
                    institutionId={workflowResult.scope.institutionId}
                    period={workflowResult.scope.period}
                    activeAgents={workflowResult.activeAgents}
                    verified={workflowResult.verification.verified}
                    checksPassed={workflowResult.verification.checks.filter((check) => check.status === 'passed').length}
                    checkCount={workflowResult.verification.checks.length}
                    latencyMs={workflowResult.latencyMs}
                  />

                  {/* Plan Steps List */}
                  <details style={{ marginTop: '10px', fontSize: '11px', color: '#475569' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 700, color: 'var(--teal)' }}>
                      View Workflow Execution Plan ({workflowResult.plan.steps.length} sequential & parallel steps)
                    </summary>
                    <div style={{ marginTop: '8px', padding: '10px', background: '#f8fafc', borderRadius: '6px' }}>
                      <p style={{ margin: '0 0 6px', fontStyle: 'italic' }}>{workflowResult.plan.description}</p>
                      <ol style={{ margin: 0, paddingLeft: '18px', display: 'grid', gap: '4px' }}>
                        {workflowResult.plan.steps.map((st, i) => (
                          <li key={i}>{st}</li>
                        ))}
                      </ol>
                    </div>
                  </details>
                </div>
              </section>

              {/* Data Cards (if present) */}
              {workflowResult.response.dataCards && workflowResult.response.dataCards.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                  {workflowResult.response.dataCards.map((card, idx) => (
                    <div className="panel" key={idx} style={{ padding: '14px' }}>
                      <div style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                        {card.title}
                      </div>
                      <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--ink)', margin: '4px 0' }}>
                        {card.value}
                      </div>
                      {card.caption && <div className="panel-caption">{card.caption}</div>}
                      {card.badge && (
                        <span className="severity-pill severity-info" style={{ marginTop: '6px', fontSize: '9px' }}>
                          {card.badge}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <AgentsCharts
                intent={workflowResult.intent}
                analyticalResults={workflowResult.analyticalResults}
              />

              {followUps.length > 0 && (
                <section className="panel" aria-labelledby="workflow-followups-title">
                  <div className="panel-header">
                    <div>
                      <h3 className="panel-title" id="workflow-followups-title">
                        Follow-up questions
                      </h3>
                      <p className="panel-caption">
                        Generated from the current scope and returned evidence.
                      </p>
                    </div>
                  </div>
                  <div className="panel-body">
                    <div className="assistant-suggestions" aria-label="Suggested follow-up questions">
                      {followUps.map((chip) => (
                        <button
                          type="button"
                          className="assistant-suggestion"
                          key={chip.question}
                          onClick={() => applyFollowUp(chip)}
                          disabled={workflowLoading}
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </section>
              )}

              {workflowFacts.length > 0 && (
                <section className="panel" aria-labelledby="workflow-facts-title">
                  <div className="panel-header">
                    <div>
                      <h3 className="panel-title" id="workflow-facts-title">
                        Key facts
                      </h3>
                      <p className="panel-caption">
                        Structured facts returned with this workflow result.
                      </p>
                    </div>
                  </div>
                  <div className="panel-body">
                    <dl className="assistant-plan-details assistant-narrative-facts">
                      {workflowFacts.map((fact, index) => (
                        <div key={`${fact.label}-${index}`}>
                          <dt>{fact.label}</dt>
                          <dd>
                            {fact.value}
                            {fact.detail && <span className="panel-caption">{fact.detail}</span>}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </section>
              )}

              {/* Executive Summary & Grounded Findings */}
              <section className="panel" aria-labelledby="workflow-response-title">
                <div className="panel-header">
                  <div>
                    <h3 className="panel-title" id="workflow-response-title">
                      Supervisory Briefing
                    </h3>
                    <p className="panel-caption">Findings prepared from the available records</p>
                  </div>
                  <span className="period-chip">
                    {workflowResult.scope.period || 'Portfolio Current'}
                  </span>
                </div>
                <div className="panel-body">
                  <div
                    style={{
                      padding: '12px 14px',
                      backgroundColor: '#f8fafc',
                      borderRadius: '8px',
                      borderLeft: '4px solid var(--teal)',
                      marginBottom: '14px',
                    }}
                  >
                    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--teal)', textTransform: 'uppercase' }}>
                      Executive Summary
                    </div>
                    <p style={{ margin: '4px 0 0', fontSize: '13px', fontWeight: 600, color: '#1e293b', lineHeight: 1.5 }}>
                      {workflowResult.response.executiveSummary}
                    </p>
                  </div>

                  <div style={{ fontSize: '12px', lineHeight: 1.7, color: '#334155', whiteSpace: 'pre-wrap' }}>
                    {workflowResult.response.detail}
                  </div>

                  {/* Synthetic Training Disclaimer */}
                  <div
                    style={{
                      marginTop: '16px',
                      padding: '10px 12px',
                      borderRadius: '6px',
                      backgroundColor: '#fffbeb',
                      border: '1px solid #fef3c7',
                      fontSize: '11px',
                      color: '#92400e',
                    }}
                  >
                    <strong>Notice:</strong> {workflowResult.response.disclaimer}
                  </div>
                </div>
              </section>

              {/* Verification Checklist */}
              <section className="panel" aria-labelledby="verification-checks-title">
                <div className="panel-header">
                  <div>
                    <h3 className="panel-title" id="verification-checks-title">
                      Automated checks
                    </h3>
                    <p className="panel-caption">
                      Automatic checks run before the answer is finalized
                    </p>
                  </div>
                  <span
                    className={`status-pill ${
                      workflowResult.verification.verified ? '' : 'agent-failed-pill'
                    }`}
                  >
                    {workflowResult.verification.verified ? 'All Gates Passed' : 'Verification Warning'}
                  </span>
                </div>
                <div className="panel-body">
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {workflowResult.verification.checks.map((chk, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'baseline',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          background: chk.status === 'passed' ? '#f0faf7' : '#fff7ed',
                          border: `1px solid ${chk.status === 'passed' ? '#ccece6' : '#fed7aa'}`,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ color: chk.status === 'passed' ? '#087467' : '#c2410c', fontWeight: 700 }}>
                            {chk.status === 'passed' ? '✓' : '!'}
                          </span>
                          <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'capitalize' }}>
                            {chk.name.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <span style={{ fontSize: '11px', color: '#475569' }}>{chk.detail}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              {/* Citations & Evidence Panel */}
              {workflowResult.response.citations && workflowResult.response.citations.length > 0 && (
                <section className="panel" aria-labelledby="citations-title">
                  <div className="panel-header">
                    <div>
                      <h3 className="panel-title" id="citations-title">
                        Sources ({workflowResult.response.citations.length})
                      </h3>
                      <p className="panel-caption">Reference material used for this answer</p>
                    </div>
                    <span className="period-chip">Sources</span>
                  </div>
                  <div className="panel-body">
                    <div style={{ display: 'grid', gap: '8px' }}>
                      {workflowResult.response.citations.map((c, idx) => (
                        <div
                          key={idx}
                          style={{
                            padding: '10px 12px',
                            borderRadius: '6px',
                            border: '1px solid var(--line)',
                            backgroundColor: '#ffffff',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span
                              style={{
                                fontWeight: 700,
                                fontSize: '11px',
                                color: 'var(--teal)',
                                backgroundColor: '#e6f7f4',
                                padding: '2px 6px',
                                borderRadius: '4px',
                              }}
                            >
                              {c.reference}
                            </span>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: '#1e293b' }}>{c.title}</span>
                            {c.kind && (
                              <span className="role-pill" style={{ fontSize: '8px' }}>
                                {c.kind}
                              </span>
                            )}
                          </div>
                          <p style={{ margin: 0, fontSize: '11px', color: '#64748b', lineHeight: 1.5 }}>
                            {c.excerpt}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      )}

      {/* ==============================================================
          MODE 2: SPECIALIST AGENT DIRECT PROMPT (MANUAL ROLES)
          ============================================================== */}
      {activeTab === 'direct' && (
        <div style={{ display: 'grid', gap: '18px' }}>
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

          <form className="panel agent-prompt-panel" onSubmit={handleDirectSubmit}>
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Ask for an analysis</h2>
                <p className="panel-caption">
                  Your question and aggregate dashboard totals may be sent to the configured AI service.
                  Never include real institution or personal data.
                </p>
              </div>
            </div>
            <div className="panel-body agent-prompt-body">
              <label className="agent-message-label" htmlFor="agent-message">Analysis request</label>
              <textarea
                id="agent-message"
                className="agent-message-input"
                value={directMessage}
                onChange={(event) => {
                  setDirectMessage(event.target.value);
                  setDirectResult(null);
                  setDirectSyntheticConfirmed(false);
                }}
                placeholder="Ask for a bounded explanation of a synthetic example..."
                maxLength={MAX_MESSAGE_LENGTH}
                minLength={2}
                required
              />
              <label className="agent-synthetic-consent">
                <input
                  type="checkbox"
                  checked={directSyntheticConfirmed}
                  onChange={(event) => setDirectSyntheticConfirmed(event.target.checked)}
                />
                <span>
                  I confirm this request uses synthetic training data only. The question and
                  aggregate dashboard context may be sent to the configured AI service.
                </span>
              </label>
              <div className="agent-prompt-footer">
                <span className="panel-caption">{directMessage.length}/{MAX_MESSAGE_LENGTH} characters</span>
                <div className="agent-prompt-actions">
                  <div className="agent-mode" role="group" aria-label="Run style">
                    <button
                      type="button"
                      aria-pressed={parallel}
                      className={parallel ? 'selected' : ''}
                      onClick={() => setParallel(true)}
                    >
                      At once
                    </button>
                    <button
                      type="button"
                      aria-pressed={!parallel}
                      className={!parallel ? 'selected' : ''}
                      onClick={() => setParallel(false)}
                    >
                      Step by step
                    </button>
                  </div>
                  <button
                    className="button-primary"
                    type="submit"
                    disabled={
                      selectedAgents.size === 0 ||
                      directMessage.trim().length < 2 ||
                      !directSyntheticConfirmed ||
                      directLoading
                    }
                  >
                    {directLoading ? 'Analyzing...' : 'Run analysis'}
                  </button>
                </div>
              </div>
            </div>
          </form>

          <div aria-live="polite" aria-busy={directLoading}>
            {directLoading && (
              <section className="panel agent-loading" role="status">
                <span className="agent-loading-indicator" aria-hidden="true" />
                <span>Waiting for the analysis service…</span>
              </section>
            )}
            {directResult && (
              <section className="agent-results" aria-labelledby="agent-results-title">
                <div className="agent-section-heading">
                  <div>
                    <h2 className="panel-title" id="agent-results-title">Analysis responses</h2>
                    <p className="panel-caption">
                      {directResult.agents.length} analysis area(s) · {directResult.totalLatencyMs} ms
                    </p>
                  </div>
                  <span className={`status-pill${directResult.success ? '' : ' agent-failed-pill'}`}>
                    {directResult.success ? 'Complete' : 'Needs attention'}
                  </span>
                </div>
                {directResult.error && <p className="form-error" role="alert">{directResult.error}</p>}
                <div className="agent-result-grid">
                  {directResult.agents.map((agent) => (
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
      )}
    </div>
  );
}

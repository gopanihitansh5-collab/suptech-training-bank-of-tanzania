'use client';

import { useMemo, useState } from 'react';

export interface WorkflowNodeGraphProps {
  intent: string;
  institutionId?: string | null;
  period?: string | null;
  activeAgents: string[];
  verified: boolean;
  checksPassed: number;
  checkCount: number;
  latencyMs: number;
}

interface GraphNode {
  id: string;
  label: string;
  step: string;
  description: string;
  matches: string[];
}

const NODES: GraphNode[] = [
  {
    id: 'router',
    label: 'Understand request',
    step: '01',
    description: 'Reads the question and chooses the right workflow.',
    matches: ['supervisor-router'],
  },
  {
    id: 'context',
    label: 'Find context',
    step: '02',
    description: 'Resolves the period, institution and permitted scope.',
    matches: ['institution-context'],
  },
  {
    id: 'analysis',
    label: 'Analyse records',
    step: '03',
    description: 'Runs approved calculations and searches reference documents.',
    matches: ['data-analyst', 'document-retrieval', 'exception-indicator', 'report-agent'],
  },
  {
    id: 'verify',
    label: 'Check quality',
    step: '04',
    description: 'Verifies figures, sources and policy safeguards.',
    matches: ['verification-agent'],
  },
  {
    id: 'summary',
    label: 'Prepare answer',
    step: '05',
    description: 'Writes the summary and attaches the source records.',
    matches: ['response-composer'],
  },
];

function nodeState(
  node: GraphNode,
  activeAgents: string[],
  verified: boolean,
): 'active' | 'warning' | 'idle' {
  const active = node.matches.some((match) => activeAgents.includes(match));
  if (node.id === 'verify' && active && !verified) return 'warning';
  return active ? 'active' : 'idle';
}

export function WorkflowNodeGraph({
  intent,
  institutionId,
  period,
  activeAgents,
  verified,
  checksPassed,
  checkCount,
  latencyMs,
}: WorkflowNodeGraphProps) {
  const [selectedId, setSelectedId] = useState('router');
  const states = useMemo(
    () => NODES.map((node) => ({ ...node, state: nodeState(node, activeAgents, verified) })),
    [activeAgents, verified],
  );
  const selected = states.find((node) => node.id === selectedId) ?? states[0];

  return (
    <div className="workflow-graph">
      <div className="workflow-canvas" role="group" aria-label="Workflow steps">
        <svg className="workflow-edges" viewBox="0 0 1000 240" aria-hidden="true">
          {states.slice(0, -1).map((node, index) => {
            const next = states[index + 1];
            const start = 100 + index * 200 + 54;
            const end = 100 + (index + 1) * 200 - 54;
            const active = node.state !== 'idle' && next.state !== 'idle';
            return (
              <g key={`${node.id}-${next.id}`}>
                <path
                  d={`M ${start} 120 C ${start + 24} 120, ${end - 24} 120, ${end} 120`}
                  className={`workflow-edge${active ? ' is-active' : ''}`}
                />
                {active && (
                  <circle r="3.5" className="workflow-edge-dot">
                    <animateMotion
                      dur="2.4s"
                      repeatCount="indefinite"
                      path={`M ${start} 120 C ${start + 24} 120, ${end - 24} 120, ${end} 120`}
                    />
                  </circle>
                )}
              </g>
            );
          })}
        </svg>

        <div className="workflow-node-row">
          {states.map((node) => (
            <button
              key={node.id}
              type="button"
              className={`workflow-node is-${node.state}${selectedId === node.id ? ' is-selected' : ''}`}
              aria-pressed={selectedId === node.id}
              onClick={() => setSelectedId(node.id)}
            >
              <span className="workflow-node-step">{node.step}</span>
              <span className="workflow-node-label">{node.label}</span>
              <span className="workflow-node-status">
                {node.state === 'warning' ? 'Review' : node.state === 'active' ? 'Done' : 'Skipped'}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="workflow-detail" role="status" aria-live="polite">
        <div>
          <div className="workflow-detail-step">Step {selected.step}</div>
          <strong>{selected.label}</strong>
          <p>{selected.description}</p>
        </div>
        <dl className="workflow-detail-facts">
          <div>
            <dt>Status</dt>
            <dd>{selected.state === 'warning' ? 'Needs review' : selected.state === 'active' ? 'Completed' : 'Not used'}</dd>
          </div>
          <div>
            <dt>Workflow</dt>
            <dd>{intent.replace(/_/g, ' ')}</dd>
          </div>
          <div>
            <dt>Scope</dt>
            <dd>{institutionId || 'Portfolio'}{period ? ` · ${period}` : ''}</dd>
          </div>
          <div>
            <dt>Checks</dt>
            <dd>{checksPassed}/{checkCount} passed</dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd>{latencyMs} ms</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

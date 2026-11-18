import { listAvailableAgents } from '@/lib/orchestration';
import { AgentsDashboard } from '@/components/agents-dashboard';

export default async function AgentsPage() {
  const agents = listAvailableAgents();

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Multi-Agentic Supervision</h1>
          <p className="page-subtitle">
            Coordinate multiple AI agents for complex supervisory tasks using local Qwen model
          </p>
        </div>
        <div className="badge" title="Local AI">
          <span className="badge-dot" />
          Qwen3.6-35B Local
        </div>
      </div>

      <div className="info-banner">
        <p>
          <strong>Multi-Agentic Orchestration:</strong> Select one or more agents to execute
          the same supervisory query in parallel or sequential mode. Each agent specializes
          in a different aspect of banking supervision.
        </p>
      </div>

      <AgentsDashboard availableAgents={agents} />
    </div>
  );
}

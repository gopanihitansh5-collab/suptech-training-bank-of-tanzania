import { listAvailableAgents } from '@/lib/orchestration';
import { AgentsWorkspace } from '@/components/agents-workspace';

export default async function AgentsPage() {
  const agents = listAvailableAgents().map(({ id, name, description }) => ({
    id,
    name,
    description,
  }));

  return (
    <main className="page-content">
      <div className="synthetic-banner">
        <span aria-hidden="true">ⓘ</span>
        <div>
          <strong>Experimental local-model workspace.</strong> Use synthetic
          examples only. Responses are not verified findings, official policy,
          or a substitute for checking persisted records.
        </div>
      </div>
      <section className="page-heading">
        <div>
          <div className="eyebrow">Experimental analysis</div>
          <h1>Local model workspace</h1>
          <p className="subtitle">Assign bounded analysis roles to the configured local Qwen service.</p>
        </div>
        <span className="period-chip">Local runtime · may be unavailable</span>
      </section>
      <AgentsWorkspace availableAgents={agents} />
    </main>
  );
}

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
          <strong>Experimental AI analysis workspace.</strong> Use synthetic
          examples only. Responses are not verified findings, official policy,
          or a substitute for checking persisted records.
        </div>
      </div>
      <section className="page-heading">
        <div>
          <div className="eyebrow">Experimental analysis</div>
          <h1>AI agent workspace</h1>
          <p className="subtitle">
            Assign bounded analysis roles to the configured AI service, using only the question and synthetic aggregate dashboard context.
          </p>
        </div>
        <span className="period-chip">AI service when configured · aggregates only</span>
      </section>
      <AgentsWorkspace availableAgents={agents} />
    </main>
  );
}

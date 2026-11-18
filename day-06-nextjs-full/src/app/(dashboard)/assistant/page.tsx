import Link from 'next/link';
import { AssistantWorkspace } from '@/components/assistant-workspace';

export default function AssistantPage() {
  return (
    <main className="page-content">
      <div className="synthetic-banner">
        <span aria-hidden="true">ⓘ</span>
        <div>
          <strong>Controlled synthetic-data assistant.</strong> This page uses
          a deterministic planner and allowlisted, read-only tools. It does not
          generate SQL or provide official regulatory conclusions.
        </div>
      </div>
      <section className="page-heading">
        <div>
          <div className="eyebrow">Grounded analysis</div>
          <h1>AI supervisory assistant</h1>
          <p className="subtitle">Preview an evidence-scoped query, confirm it, and inspect its source records.</p>
        </div>
        <span className="period-chip">Mock planner · no external model</span>
      </section>
      <AssistantWorkspace />
      <section className="assistant-alternatives" aria-label="Explore source pages">
        <span>Prefer direct review?</span>
        <Link className="table-link" href="/analytics">Open analytics</Link>
        <Link className="table-link" href="/exceptions">Open review signals</Link>
      </section>
    </main>
  );
}

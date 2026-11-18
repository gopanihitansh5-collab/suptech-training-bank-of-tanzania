import Link from 'next/link';

export default function AssistantPage() {
  return (
    <main className="page-content">
      <div className="synthetic-banner">
        <span aria-hidden="true">ⓘ</span>
        <div>
          <strong>Assistant not connected.</strong> Retrieval, chat, citations
          and generated recommendations are planned for later phases. No
          assistant answers are being generated on this page.
        </div>
      </div>
      <section className="page-heading">
        <div>
          <div className="eyebrow">Grounded analysis</div>
          <h1>AI supervisory assistant</h1>
          <p className="subtitle">Explore the verified analytics and review-signal workflows available today.</p>
        </div>
        <span className="period-chip">Not integrated</span>
      </section>
      <section className="capability-grid">
        <article className="panel capability-card">
          <div className="eyebrow">Available now</div>
          <h2 className="panel-title">Inspect persisted indicators</h2>
          <p className="panel-caption">Review synthetic indicator values, formulas and reporting-period trends.</p>
          <Link className="button-primary" href="/analytics">Open analytics</Link>
        </article>
        <article className="panel capability-card">
          <div className="eyebrow">Available now</div>
          <h2 className="panel-title">Trace review signals</h2>
          <p className="panel-caption">Filter illustrative exceptions and follow each signal to its institution history.</p>
          <Link className="button-primary" href="/exceptions">Open exceptions</Link>
        </article>
        <article className="panel capability-card capability-planned">
          <div className="eyebrow">Planned</div>
          <h2 className="panel-title">Grounded question answering</h2>
          <p className="panel-caption">A future assistant must cite synthetic source records and fail closed when evidence is unavailable.</p>
          <span className="nav-tag">Not available</span>
        </article>
      </section>
    </main>
  );
}

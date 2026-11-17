'use client';

export default function DashboardError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="page-content">
      <section className="error-panel" role="alert">
        <div className="eyebrow">Service unavailable</div>
        <h1>Dashboard data could not be loaded</h1>
        <p>
          Check that the isolated Day 6 database is running and that its local
          connection settings are valid, then retry. No placeholder metrics
          have been substituted.
        </p>
        <button className="button-primary" onClick={retry}>Retry</button>
      </section>
    </main>
  );
}

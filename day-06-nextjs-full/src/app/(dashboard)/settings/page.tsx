import { requireDemoSession } from '@/lib/auth';

export default async function SettingsPage() {
  const session = await requireDemoSession();

  return (
    <main className="page-content">
      <div className="synthetic-banner">
        <span aria-hidden="true">ⓘ</span>
        <div>
          <strong>Read-only demo settings.</strong> This local training account
          is not a production identity or authorization system. Configuration
          changes are not enabled.
        </div>
      </div>
      <section className="page-heading">
        <div>
          <div className="eyebrow">Access and configuration</div>
          <h1>Administration &amp; settings</h1>
          <p className="subtitle">Inspect the current demo boundary without changing application configuration.</p>
        </div>
      </section>
      <section className="panel settings-panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Current session</h2>
            <p className="panel-caption">Values shown here come from the signed local demo session.</p>
          </div>
        </div>
        <dl className="settings-list">
          <div><dt>Session role</dt><dd>{session.role}</dd></div>
          <div><dt>Authentication</dt><dd>Local signed demo session</dd></div>
          <div><dt>Policy and threshold editing</dt><dd>Not available</dd></div>
          <div><dt>User provisioning</dt><dd>Not available</dd></div>
          <div><dt>Secret values</dt><dd>Never displayed in this screen</dd></div>
        </dl>
      </section>
    </main>
  );
}

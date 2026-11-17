import { redirect } from 'next/navigation';
import { AuthError, requireDemoSession } from '@/lib/auth';
import { DashboardNavigation } from '@/components/dashboard-navigation';
import { LogoutButton } from '@/components/logout-button';

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  let session;
  try {
    session = await requireDemoSession();
  } catch (error) {
    if (error instanceof AuthError && error.status === 401) redirect('/login');
    throw error;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="brand">
            <div className="brand-mark" aria-hidden="true">S</div>
            <div>
              <div className="brand-title">SupTech Monitor</div>
              <div className="brand-subtitle">Supervisory intelligence</div>
            </div>
          </div>
          <div className="nav-caption">Training console</div>
          <DashboardNavigation />
        </div>
        <div className="sidebar-note">
          <strong>Environment</strong>
          <span>Local synthetic training data</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="crumbs"><strong>SupTech Monitor</strong> / Day 6 application</div>
          <div className="user-area">
            <span className="session-label">{session.userId}</span>
            <span className="role-pill">{session.role}</span>
            <LogoutButton />
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}

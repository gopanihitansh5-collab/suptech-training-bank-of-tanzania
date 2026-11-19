import { redirect } from 'next/navigation';
import { AuthError, requireDemoSession } from '@/lib/auth';
import {
  DashboardBreadcrumb,
  DashboardNavigation,
  MobileNavigation,
} from '@/components/dashboard-navigation';
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
          <div className="nav-caption">Supervisory workspace</div>
          <DashboardNavigation />
        </div>
        <div className="sidebar-note">
          <strong>Training data</strong>
          <span>Synthetic records only</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-start">
            <MobileNavigation />
            <DashboardBreadcrumb />
          </div>
          <div className="user-area">
            <span className="user-avatar" aria-hidden="true">
              {session.userId.trim().charAt(0).toUpperCase()}
            </span>
            <div className="user-identity">
              <span className="session-label">{session.userId}</span>
              <span className="role-pill">{session.role}</span>
            </div>
            <LogoutButton />
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}

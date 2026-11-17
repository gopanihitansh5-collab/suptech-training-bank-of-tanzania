'use client';

import Link from 'next/link';

import { LiveStatusBadge } from './LiveStatusBadge';
import type { LiveStatus } from '../live';

interface AppHeaderProps {
  live?: {
    status: LiveStatus;
    eventsReceived: number;
    lastEventAt: string | null;
    runId: string | null;
  };
}

export function AppHeader({ live }: AppHeaderProps) {
  return (
    <header className="app__header">
      <div>
        <h1 className="app__title">Supervisory monitoring dashboard</h1>
        <p className="app__subtitle">
          NavsaTech — Bank of Tanzania SupTech prototype. Synthetic data.
        </p>
        <nav className="app__nav" aria-label="Main navigation">
          <Link href="/">Dashboard</Link>
          <Link href="/analyst">Analyst workspace</Link>
        </nav>
      </div>
      <div className="app__header-side">
        {live ? (
          <LiveStatusBadge
            status={live.status}
            eventsReceived={live.eventsReceived}
            lastEventAt={live.lastEventAt}
            runId={live.runId}
          />
        ) : null}
        <span className="analyst__mode">Public training demo</span>
      </div>
    </header>
  );
}

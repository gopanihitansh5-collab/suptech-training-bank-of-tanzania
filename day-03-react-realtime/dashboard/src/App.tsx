import { useCallback, useState } from 'react';

import { LdrChart, SeverityChart } from './components/Charts';
import { ExceptionDetail } from './components/ExceptionDetail';
import { ExceptionsTable } from './components/ExceptionsTable';
import { Filters } from './components/Filters';
import { InstitutionDetail } from './components/InstitutionDetail';
import { InstitutionsTable } from './components/InstitutionsTable';
import { KpiCards } from './components/KpiCards';
import { LiveStatusBadge } from './components/LiveStatusBadge';
import { UnlockScreen } from './components/UnlockScreen';
import { EMPTY_FILTERS, useDashboardData } from './hooks/useDashboard';
import { useLiveEvents } from './hooks/useLiveEvents';
import type { SupervisoryException } from './types';

export interface DashboardProps {
  token: string;
  onSignOut: () => void;
}

/** The dashboard itself: the read model, the live status and the drill-downs. */
export function Dashboard({ token, onSignOut }: DashboardProps) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selectedException, setSelectedException] =
    useState<SupervisoryException | null>(null);
  const [selectedInstitution, setSelectedInstitution] = useState<string | null>(
    null,
  );

  const data = useDashboardData(token, filters);

  const onLiveEvent = useCallback(
    (event: { type: string }) => {
      if (event.type === 'run.available') {
        void data.refresh();
      }
    },
    [data],
  );

  const live = useLiveEvents(token, onLiveEvent);

  const periods = data.periods
    .map((period) => period.reporting_period)
    .filter((period): period is string => Boolean(period));

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <h1 className="app__title">Supervisory monitoring dashboard</h1>
          <p className="app__subtitle">
            NavsaTech — Bank of Tanzania SupTech prototype. Synthetic data.
          </p>
        </div>
        <div className="app__header-side">
          <LiveStatusBadge
            status={live.status}
            eventsReceived={live.eventsReceived}
            lastEventAt={
              live.lastEvent && typeof live.lastEvent.data === 'object'
                ? ((live.lastEvent.data as { detected_at?: string }).detected_at ??
                  null)
                : null
            }
            runId={data.summary?.run_id ?? null}
          />
          <button type="button" className="button" onClick={onSignOut}>
            Lock the dashboard
          </button>
        </div>
      </header>

      <main className="app__body">
        <Filters
          periods={periods}
          reportingPeriod={filters.reportingPeriod}
          severity={filters.severity}
          institution={filters.institution}
          onChange={setFilters}
        />

        {data.error ? (
          <p className="error error--banner">
            The dashboard could not read the API: {data.error}
          </p>
        ) : null}

        {data.loading ? <p className="loading">Reading the read model…</p> : null}

        <KpiCards summary={data.summary} />

        <div className="app__grid">
          <section className="panel panel--wide">
            <div className="panel__head">
              <h2>Exceptions</h2>
              <span className="panel__count">{data.exceptions.length}</span>
            </div>
            <ExceptionsTable
              exceptions={data.exceptions}
              selectedId={selectedException?.exception_id ?? null}
              onSelect={setSelectedException}
            />
          </section>

          <SeverityChart exceptions={data.exceptions} />
          <LdrChart indicators={data.indicators} />

          <section className="panel panel--wide">
            <div className="panel__head">
              <h2>Supervised institutions</h2>
              <span className="panel__count">{data.institutions.length}</span>
            </div>
            <InstitutionsTable
              institutions={data.institutions}
              selectedId={selectedInstitution}
              onSelect={(institution) =>
                setSelectedInstitution(institution.institution_id)
              }
            />
          </section>
        </div>

        {data.lastUpdated ? (
          <p className="app__footer">
            Read model loaded at {new Date(data.lastUpdated).toLocaleTimeString()}.
            The live stream updates it when the pipeline produces a new run.
          </p>
        ) : null}
      </main>

      {selectedException ? (
        <ExceptionDetail
          token={token}
          exception={selectedException}
          onClose={() => setSelectedException(null)}
        />
      ) : null}

      {selectedInstitution ? (
        <InstitutionDetail
          token={token}
          institutionId={selectedInstitution}
          onClose={() => setSelectedInstitution(null)}
        />
      ) : null}
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState<string | null>(null);

  if (!token) {
    return <UnlockScreen onUnlock={setToken} />;
  }
  return <Dashboard token={token} onSignOut={() => setToken(null)} />;
}

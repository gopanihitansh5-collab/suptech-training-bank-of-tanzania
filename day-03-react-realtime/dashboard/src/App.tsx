'use client';

import { useCallback, useState } from 'react';

import { LdrChart, SeverityChart } from './components/Charts';
import { AppHeader } from './components/AppHeader';
import { ExceptionDetail } from './components/ExceptionDetail';
import { ExceptionsTable } from './components/ExceptionsTable';
import { Filters } from './components/Filters';
import { InstitutionDetail } from './components/InstitutionDetail';
import { InstitutionsTable } from './components/InstitutionsTable';
import { KpiCards } from './components/KpiCards';
import { EMPTY_FILTERS, useDashboardData } from './hooks/useDashboard';
import { useLiveEvents } from './hooks/useLiveEvents';
import type { SupervisoryException } from './types';

/** The dashboard itself: the read model, the live status and the drill-downs. */
export function Dashboard() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selectedException, setSelectedException] =
    useState<SupervisoryException | null>(null);
  const [selectedInstitution, setSelectedInstitution] = useState<string | null>(
    null,
  );

  const data = useDashboardData(filters);

  const onLiveEvent = useCallback(
    (event: { type: string }) => {
      if (event.type === 'run.available') {
        void data.refresh();
      }
    },
    [data],
  );

  const live = useLiveEvents(onLiveEvent);

  const periods = data.periods
    .map((period) => period.reporting_period)
    .filter((period): period is string => Boolean(period));

  return (
    <div className="app">
      <AppHeader
        live={{
          status: live.status,
          eventsReceived: live.eventsReceived,
          lastEventAt:
            live.lastEvent && typeof live.lastEvent.data === 'object'
              ? ((live.lastEvent.data as { detected_at?: string }).detected_at ??
                null)
              : null,
          runId: data.summary?.run_id ?? null,
        }}
      />

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
          exception={selectedException}
          onClose={() => setSelectedException(null)}
        />
      ) : null}

      {selectedInstitution ? (
        <InstitutionDetail
          institutionId={selectedInstitution}
          onClose={() => setSelectedInstitution(null)}
        />
      ) : null}
    </div>
  );
}

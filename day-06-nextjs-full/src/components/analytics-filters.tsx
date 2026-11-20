'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

export interface AnalyticsFilterOption {
  id: string;
  label: string;
}

export function AnalyticsFilters({
  period,
  indicator,
  periods,
  indicators,
}: {
  period?: string;
  indicator?: string;
  periods: string[];
  indicators: AnalyticsFilterOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function update(nextPeriod: string, nextIndicator: string) {
    const params = new URLSearchParams(window.location.search);
    if (nextPeriod) params.set('period', nextPeriod);
    else params.delete('period');
    if (nextIndicator) params.set('indicator', nextIndicator);
    else params.delete('indicator');
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `/analytics?${query}` : '/analytics', { scroll: false });
    });
  }

  return (
    <form className="filter-form analytics-instant-filter" onSubmit={(event) => event.preventDefault()}>
      <label>
        Reporting period
        <select
          name="period"
          value={period ?? ''}
          onChange={(event) => update(event.target.value, indicator ?? '')}
        >
          {periods.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </label>
      <label>
        Indicator
        <select
          name="indicator"
          value={indicator ?? ''}
          onChange={(event) => update(period ?? '', event.target.value)}
        >
          <option value="">Headline indicators</option>
          {indicators.map((definition) => (
            <option key={definition.id} value={definition.id}>{definition.label}</option>
          ))}
        </select>
      </label>
      <span className={`filter-pending${pending ? ' is-pending' : ''}`} role="status" aria-live="polite">
        {pending ? 'Updating…' : ''}
      </span>
    </form>
  );
}

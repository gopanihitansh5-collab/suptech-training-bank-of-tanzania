import { useCallback, useEffect, useState } from 'react';

import { api } from '../api';
import type {
  IndicatorValue,
  Institution,
  SectorSummary,
  SupervisoryException,
} from '../types';

export interface Filters {
  reportingPeriod: string;
  severity: string;
  institution: string;
}

export const EMPTY_FILTERS: Filters = {
  reportingPeriod: '',
  severity: '',
  institution: '',
};

export interface DashboardData {
  summary: SectorSummary | null;
  periods: SectorSummary[];
  exceptions: SupervisoryException[];
  institutions: Institution[];
  indicators: IndicatorValue[];
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
  refresh: () => Promise<void>;
}

/**
 * Load the read model from the API.
 *
 * Everything the dashboard shows comes from here, and everything here comes
 * from the API. When the live stream reports a new run, the caller calls
 * `refresh` and the same read model is fetched again.
 */
export function useDashboardData(
  filters: Filters,
): DashboardData {
  const [summary, setSummary] = useState<SectorSummary | null>(null);
  const [periods, setPeriods] = useState<SectorSummary[]>([]);
  const [exceptions, setExceptions] = useState<SupervisoryException[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [indicators, setIndicators] = useState<IndicatorValue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryResult, exceptionResult, institutionResult, indicatorResult] =
        await Promise.all([
          api.summary(),
          api.exceptions({
            reporting_period: filters.reportingPeriod || undefined,
            severity: filters.severity || undefined,
            institution_id: filters.institution || undefined,
          }),
          api.institutions(),
          api.indicators({
            reporting_period: filters.reportingPeriod || undefined,
          }),
        ]);

      const availablePeriods = summaryResult.periods ?? [];
      setPeriods(availablePeriods);
      setSummary(
        filters.reportingPeriod
          ? (availablePeriods.find(
              (period) => period.reporting_period === filters.reportingPeriod,
            ) ?? null)
          : (availablePeriods[0] ?? null),
      );
      setExceptions(exceptionResult.exceptions ?? []);
      setInstitutions(institutionResult.institutions ?? []);
      setIndicators(indicatorResult.indicators ?? []);
      setError(null);
      setLastUpdated(new Date().toISOString());
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : 'the API could not be reached';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [filters.reportingPeriod, filters.severity, filters.institution]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    summary,
    periods,
    exceptions,
    institutions,
    indicators,
    loading,
    error,
    lastUpdated,
    refresh,
  };
}

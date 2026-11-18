'use client';

import { useEffect, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface PortfolioPoint {
  period: string;
  depositsTzsBillions: number;
  loansTzsBillions: number;
  completenessPercent: number | null;
  exceptions: number;
}

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setReducedMotion(preference.matches);
    updatePreference();
    preference.addEventListener('change', updatePreference);
    return () => preference.removeEventListener('change', updatePreference);
  }, []);

  return reducedMotion;
}

export function PortfolioChart({ data }: { data: PortfolioPoint[] }) {
  const reducedMotion = useReducedMotion();
  const [visibleSeries, setVisibleSeries] = useState({
    deposits: true,
    loans: true,
  });

  if (!data.length) return <div className="empty-state">No reporting history is available.</div>;
  const hasVisibleSeries = visibleSeries.deposits || visibleSeries.loans;

  function toggleSeries(series: 'deposits' | 'loans') {
    setVisibleSeries((current) => ({ ...current, [series]: !current[series] }));
  }

  return (
    <>
      <div className="chart-legend" aria-label="Toggle chart series">
        <button
          className="chart-legend-button"
          type="button"
          aria-pressed={visibleSeries.deposits}
          onClick={() => toggleSeries('deposits')}
        >
          <i className="legend-dot" style={{ background: '#087c70' }} aria-hidden="true" />
          Deposits
        </button>
        <button
          className="chart-legend-button"
          type="button"
          aria-pressed={visibleSeries.loans}
          onClick={() => toggleSeries('loans')}
        >
          <i className="legend-dot" style={{ background: '#5797c3' }} aria-hidden="true" />
          Loans
        </button>
      </div>
      {hasVisibleSeries ? (
        <div className="chart-wrap" role="img" aria-label="Monthly synthetic deposits and loans trend chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 10, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="#e9edf4" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="period" tick={{ fill: '#758197', fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#758197', fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip
                formatter={(value, name) => [`${Number(value).toFixed(1)} TZS bn`, name]}
                contentStyle={{ border: '1px solid #e3e8f1', borderRadius: 8, fontSize: 11 }}
              />
              {visibleSeries.deposits && (
                <Line type="monotone" dataKey="depositsTzsBillions" name="Deposits" stroke="#087c70" strokeWidth={2.5} dot={false} isAnimationActive={!reducedMotion} />
              )}
              {visibleSeries.loans && (
                <Line type="monotone" dataKey="loansTzsBillions" name="Loans" stroke="#5797c3" strokeWidth={2.5} dot={false} isAnimationActive={!reducedMotion} />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="empty-state" role="status">
          Select Deposits or Loans to show a trend.
        </div>
      )}
    </>
  );
}

export function PortfolioQualityChart({ data }: { data: PortfolioPoint[] }) {
  const reducedMotion = useReducedMotion();
  const [visibleSeries, setVisibleSeries] = useState({
    completeness: true,
    exceptions: true,
  });
  const hasVisibleSeries = visibleSeries.completeness || visibleSeries.exceptions;

  function toggleSeries(series: 'completeness' | 'exceptions') {
    setVisibleSeries((current) => ({ ...current, [series]: !current[series] }));
  }

  return (
    <div className="portfolio-quality-chart">
      <div className="chart-legend" aria-label="Toggle quality chart series">
        <button
          className="chart-legend-button"
          type="button"
          aria-pressed={visibleSeries.completeness}
          onClick={() => toggleSeries('completeness')}
        >
          <i className="legend-dot" style={{ background: '#8b5cf6' }} aria-hidden="true" />
          Reporting completeness
        </button>
        <button
          className="chart-legend-button"
          type="button"
          aria-pressed={visibleSeries.exceptions}
          onClick={() => toggleSeries('exceptions')}
        >
          <i className="legend-dot" style={{ background: '#d97706' }} aria-hidden="true" />
          Review signals
        </button>
      </div>
      {hasVisibleSeries ? (
        <div className="chart-wrap" role="img" aria-label="Monthly reporting completeness and review signal count">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="#e9edf4" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="period" tick={{ fill: '#758197', fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="percent" domain={[0, 100]} tick={{ fill: '#758197', fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="signals" orientation="right" allowDecimals={false} tick={{ fill: '#758197', fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip
                formatter={(value, name) => [
                  name === 'Completeness'
                    ? `${Number(value).toFixed(1)}%`
                    : `${Number(value)} signal(s)`,
                  name,
                ]}
                contentStyle={{ border: '1px solid #e3e8f1', borderRadius: 8, fontSize: 11 }}
              />
              {visibleSeries.completeness && (
                <Line yAxisId="percent" type="monotone" dataKey="completenessPercent" name="Completeness" stroke="#8b5cf6" strokeWidth={2.5} dot={false} connectNulls={false} isAnimationActive={!reducedMotion} />
              )}
              {visibleSeries.exceptions && (
                <Line yAxisId="signals" type="monotone" dataKey="exceptions" name="Review signals" stroke="#d97706" strokeWidth={2.5} dot={false} isAnimationActive={!reducedMotion} />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="empty-state" role="status">
          Select Reporting completeness or Review signals to show a trend.
        </div>
      )}
    </div>
  );
}

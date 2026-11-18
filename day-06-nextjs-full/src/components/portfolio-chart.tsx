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

export function PortfolioChart({ data }: { data: PortfolioPoint[] }) {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [visibleSeries, setVisibleSeries] = useState({
    deposits: true,
    loans: true,
  });

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setReducedMotion(preference.matches);
    updatePreference();
    preference.addEventListener('change', updatePreference);
    return () => preference.removeEventListener('change', updatePreference);
  }, []);

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

'use client';

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
  if (!data.length) return <div className="empty-state">No reporting history is available.</div>;
  return (
    <>
      <div className="chart-legend">
        <span><i className="legend-dot" style={{ background: '#087c70' }} />Deposits</span>
        <span><i className="legend-dot" style={{ background: '#5797c3' }} />Loans</span>
      </div>
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
            <Line type="monotone" dataKey="depositsTzsBillions" name="Deposits" stroke="#087c70" strokeWidth={2.5} dot={false} />
            <Line type="monotone" dataKey="loansTzsBillions" name="Loans" stroke="#5797c3" strokeWidth={2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

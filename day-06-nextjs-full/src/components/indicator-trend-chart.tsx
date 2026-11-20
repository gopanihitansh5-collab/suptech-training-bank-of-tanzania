'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface IndicatorTrendPoint {
  period: string;
  value: number | null;
}

export function IndicatorTrendChart({
  data,
  label,
  unit,
}: {
  data: IndicatorTrendPoint[];
  label: string;
  unit: string;
}) {
  const router = useRouter();
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduceMotion(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  if (!data.length) {
    return <div className="empty-state">No history is available for this indicator.</div>;
  }

  function drillToPoint(payload: unknown) {
    if (typeof payload !== 'object' || payload === null) return;
    if (!('period' in payload) || typeof payload.period !== 'string') return;
    const params = new URLSearchParams(window.location.search);
    params.set('period', payload.period);
    router.replace(`/analytics?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="chart-wrap chart-wrap-tall" role="img" aria-label={`${label} trend chart`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 12, right: 16, left: -8, bottom: 8 }}
          onClick={(state) => {
            const point = data.find((entry) => entry.period === String(state.activeLabel ?? ''));
            drillToPoint(point);
          }}
          accessibilityLayer
        >
          <CartesianGrid stroke="#e9edf4" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="period" tick={{ fill: '#758197', fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis
            tick={{ fill: '#758197', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={54}
            tickFormatter={(value) => `${Number(value).toFixed(1)}`}
          />
          <Tooltip
            formatter={(value) => [`${Number(value).toFixed(2)} ${unit === '%' ? '%' : unit}`, label]}
            contentStyle={{ border: '1px solid #e3e8f1', borderRadius: 10, fontSize: 11 }}
          />
          <Line
            type="monotone"
            dataKey="value"
            name={label}
            stroke="#0f766e"
            strokeWidth={2.5}
            dot={{ r: 2.5, fill: '#0f766e', strokeWidth: 0 }}
            activeDot={{ r: 5, fill: '#0f766e', stroke: '#ccfbf1', strokeWidth: 4 }}
            connectNulls={false}
            isAnimationActive={!reduceMotion}
          />
          <Brush dataKey="period" height={22} travellerWidth={8} stroke="#94a3b8" fill="#f8fafc" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

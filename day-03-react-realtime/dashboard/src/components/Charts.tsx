import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { SEVERITY_ORDER } from '../format';
import type { IndicatorValue, SupervisoryException } from '../types';

const SEVERITY_COLOURS: Record<string, string> = {
  CRITICAL: '#b4232a',
  HIGH: '#c76a12',
  MEDIUM: '#8a6d1f',
  LOW: '#3f6f4f',
};

export interface SeverityChartProps {
  exceptions: SupervisoryException[];
}

/** How many exceptions each severity holds. */
export function SeverityChart({ exceptions }: SeverityChartProps) {
  const data = SEVERITY_ORDER.map((severity) => ({
    severity,
    count: exceptions.filter((exception) => exception.severity === severity)
      .length,
  }));

  return (
    <section className="panel" aria-label="Exceptions by severity">
      <h3>Exceptions by severity</h3>
      <div className="chart chart--small">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#d8dee6" />
            <XAxis dataKey="severity" tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={32} />
            <Tooltip />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {data.map((entry) => (
                <Cell
                  key={entry.severity}
                  fill={SEVERITY_COLOURS[entry.severity] ?? '#5a6472'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export interface LdrChartProps {
  indicators: IndicatorValue[];
}

/**
 * The loan to deposit ratio of every institution in the period.
 *
 * A value the API could not compute is left out rather than drawn as
 * zero: an institution that reports no deposits has an undefined ratio,
 * and a chart that draws it as zero would be lying.
 */
export function LdrChart({ indicators }: LdrChartProps) {
  const data = indicators
    .filter(
      (indicator) =>
        indicator.indicator_id === 'IND-003' &&
        indicator.grain === 'institution' &&
        indicator.indicator_value !== null,
    )
    .map((indicator) => ({
      institution: indicator.subject_id,
      ratio: indicator.indicator_value as number,
    }))
    .sort((left, right) => right.ratio - left.ratio);

  return (
    <section className="panel" aria-label="Loan to deposit ratio by institution">
      <h3>Loan to deposit ratio</h3>
      {data.length === 0 ? (
        <p className="empty">No ratio could be computed for this period.</p>
      ) : (
        <div className="chart">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 8, right: 24, bottom: 0, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#d8dee6" />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis
                type="category"
                dataKey="institution"
                width={72}
                tick={{ fontSize: 12 }}
              />
              <Tooltip />
              <Bar dataKey="ratio" fill="#1f4e79" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  analyticsIndicators,
  analyticsTrend,
  exceptionBreakdown,
  institutionReports,
  overviewTrend,
} from './agents-chart-data';

const TOOLTIP_STYLE = { border: '1px solid #e3e8f1', borderRadius: 8, fontSize: 11 };
const SEVERITY_COLORS: Record<string, string> = {
  critical: '#b42332',
  high: '#d97706',
  medium: '#a45b12',
  low: '#64748b',
};
const STATUS_COLORS: Record<string, string> = {
  open: '#b42332',
  under_review: '#d97706',
  resolved: '#087c70',
};
const INDICATOR_COLORS = ['#087c70', '#5797c3', '#8b5cf6', '#d97706', '#b42332', '#64748b'];
const SEVERITY_NAMES = ['critical', 'high', 'medium', 'low'];

function severityColor(name: string): string {
  return SEVERITY_COLORS[name] ?? '#64748b';
}

function statusColor(name: string): string {
  return STATUS_COLORS[name] ?? '#64748b';
}

function severityClass(name: string): string {
  return SEVERITY_NAMES.includes(name)
    ? `severity-pill severity-${name}`
    : 'severity-pill severity-low';
}

export function AgentsCharts({
  intent,
  analyticalResults,
}: {
  intent: string;
  analyticalResults: unknown;
}) {
  const overview = overviewTrend(analyticalResults);
  const reports = institutionReports(analyticalResults);
  const trend = analyticsTrend(analyticalResults);
  const indicators = analyticsIndicators(analyticalResults);
  const exceptions = exceptionBreakdown(analyticalResults);
  const indicatorData = indicators.map((indicator) => ({
    ...indicator,
    axisLabel: indicator.unit ? `${indicator.label} (${indicator.unit})` : indicator.label,
  }));
  const hasAnyData =
    overview.length > 0 ||
    reports.length > 0 ||
    trend.length > 0 ||
    indicatorData.length > 0 ||
    exceptions.items.length > 0;

  if (!hasAnyData) {
    return (
      <section className="panel" aria-label="Workflow analytical charts">
        <div className="panel-body">
          <p className="panel-caption" role="status">
            No chartable analytical data was returned for this {intent} workflow.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      style={{ display: 'grid', gap: '16px' }}
      aria-label="Workflow analytical charts"
    >
      {overview.length > 0 && (
        <section className="panel" aria-labelledby="overview-trend-title">
          <div className="panel-header">
            <div>
              <h3 className="panel-title" id="overview-trend-title">
                Portfolio trend
              </h3>
              <p className="panel-caption">Synthetic deposits and loans across reporting periods.</p>
            </div>
            <span className="period-chip">{overview.length} periods</span>
          </div>
          <div className="panel-body">
            <div
              className="chart-wrap"
              style={{ height: '220px' }}
              role="img"
              aria-label="Line chart of synthetic portfolio deposits and loans by period"
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={overview} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="#e9edf4" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="period" tick={{ fill: '#758197', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: '#758197', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    formatter={(value, name) => [`${Number(value).toFixed(1)} TZS bn`, name]}
                    contentStyle={TOOLTIP_STYLE}
                  />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line type="monotone" dataKey="deposits" name="Deposits" stroke="#087c70" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="loans" name="Loans" stroke="#5797c3" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <h4 className="chart-subheading">Completeness and review signals</h4>
            <div
              className="chart-wrap"
              style={{ height: '210px' }}
              role="img"
              aria-label="Area chart of reporting completeness and review signal counts by period"
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={overview} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
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
                    contentStyle={TOOLTIP_STYLE}
                  />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Area yAxisId="percent" type="monotone" dataKey="completeness" name="Completeness" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.16} strokeWidth={2.5} />
                  <Area yAxisId="signals" type="monotone" dataKey="exceptions" name="Review signals" stroke="#d97706" fill="#d97706" fillOpacity={0.16} strokeWidth={2.5} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      )}

      {reports.length > 0 && (
        <section className="panel" aria-labelledby="institution-trend-title">
          <div className="panel-header">
            <div>
              <h3 className="panel-title" id="institution-trend-title">
                Institution report trend
              </h3>
              <p className="panel-caption">Oldest first across the latest synthetic reports.</p>
            </div>
            <span className="period-chip">{reports.length} periods</span>
          </div>
          <div className="panel-body">
            <div
              className="chart-wrap"
              style={{ height: '220px' }}
              role="img"
              aria-label="Line chart of institution deposits and loans by period"
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={reports} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="#e9edf4" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="period" tick={{ fill: '#758197', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: '#758197', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    formatter={(value, name) => [`${Number(value).toFixed(1)} TZS bn`, name]}
                    contentStyle={TOOLTIP_STYLE}
                  />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line type="monotone" dataKey="deposits" name="Deposits" stroke="#087c70" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="loans" name="Loans" stroke="#5797c3" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <h4 className="chart-subheading">Prudential ratios</h4>
            <div
              className="chart-wrap"
              style={{ height: '210px' }}
              role="img"
              aria-label="Line chart of institution capital adequacy, non-performing loan and liquidity ratios"
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={reports} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="#e9edf4" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="period" tick={{ fill: '#758197', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: '#758197', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    formatter={(value, name) => [`${Number(value).toFixed(1)}%`, name]}
                    contentStyle={TOOLTIP_STYLE}
                  />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line type="monotone" dataKey="car" name="Capital adequacy" stroke="#087c70" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="npl" name="NPL ratio" stroke="#b42332" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="liquidity" name="Liquidity" stroke="#5797c3" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      )}

      {trend.length > 0 && (
        <section className="panel" aria-labelledby="analytics-trend-title">
          <div className="panel-header">
            <div>
              <h3 className="panel-title" id="analytics-trend-title">
                Analytics trend
              </h3>
              <p className="panel-caption">Sector deposits, loans and completeness from the analytics result.</p>
            </div>
            <span className="period-chip">{trend.length} periods</span>
          </div>
          <div className="panel-body">
            <div
              className="chart-wrap"
              style={{ height: '220px' }}
              role="img"
              aria-label="Line chart of analytics deposits, loans and completeness by period"
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="#e9edf4" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="period" tick={{ fill: '#758197', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="amount" tick={{ fill: '#758197', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="percent" orientation="right" domain={[0, 100]} tick={{ fill: '#758197', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    formatter={(value, name) => [
                      name === 'Completeness'
                        ? `${Number(value).toFixed(1)}%`
                        : `${Number(value).toFixed(1)} TZS bn`,
                      name,
                    ]}
                    contentStyle={TOOLTIP_STYLE}
                  />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line yAxisId="amount" type="monotone" dataKey="deposits" name="Deposits" stroke="#087c70" strokeWidth={2.5} dot={false} />
                  <Line yAxisId="amount" type="monotone" dataKey="loans" name="Loans" stroke="#5797c3" strokeWidth={2.5} dot={false} />
                  <Line yAxisId="percent" type="monotone" dataKey="completeness" name="Completeness" stroke="#8b5cf6" strokeWidth={2.5} dot={false} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      )}

      {indicatorData.length > 0 && (
        <section className="panel" aria-labelledby="analytics-indicators-title">
          <div className="panel-header">
            <div>
              <h3 className="panel-title" id="analytics-indicators-title">
                Analytics indicators
              </h3>
              <p className="panel-caption">Non-null sector indicators with their training units.</p>
            </div>
            <span className="period-chip">{indicatorData.length} indicators</span>
          </div>
          <div className="panel-body">
            <div
              className="chart-wrap"
              style={{ height: '240px' }}
              role="img"
              aria-label="Bar chart of non-null analytical indicator values"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={indicatorData} margin={{ top: 8, right: 12, left: -12, bottom: 28 }}>
                  <CartesianGrid stroke="#e9edf4" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="axisLabel" tick={{ fill: '#758197', fontSize: 9 }} tickLine={false} axisLine={false} interval={0} angle={-18} textAnchor="end" height={54} />
                  <YAxis tick={{ fill: '#758197', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(value) => Number(value).toFixed(2)} contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="value" name="Value" radius={[4, 4, 0, 0]}>
                    {indicatorData.map((indicator, index) => (
                      <Cell key={indicator.label} fill={INDICATOR_COLORS[index % INDICATOR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      )}

      {exceptions.items.length > 0 && (
        <section className="panel" aria-labelledby="exception-charts-title">
          <div className="panel-header">
            <div>
              <h3 className="panel-title" id="exception-charts-title">
                Review signal breakdown
              </h3>
              <p className="panel-caption">Synthetic exceptions grouped by severity and status.</p>
            </div>
            <span className="period-chip">{exceptions.items.length} signals</span>
          </div>
          <div className="panel-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
              <div>
                <h4 className="chart-subheading" style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
                  By severity
                </h4>
                <div
                  className="chart-wrap"
                  style={{ height: '200px' }}
                  role="img"
                  aria-label="Bar chart of review signals grouped by severity"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={exceptions.bySeverity} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                      <CartesianGrid stroke="#e9edf4" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fill: '#758197', fontSize: 10 }} tickLine={false} axisLine={false} />
                      <YAxis allowDecimals={false} tick={{ fill: '#758197', fontSize: 10 }} tickLine={false} axisLine={false} />
                      <Tooltip formatter={(value) => `${Number(value)} signal(s)`} contentStyle={TOOLTIP_STYLE} />
                      <Bar dataKey="count" name="Signals" radius={[4, 4, 0, 0]}>
                        {exceptions.bySeverity.map((entry) => (
                          <Cell key={entry.name} fill={severityColor(entry.name)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div>
                <h4 className="chart-subheading" style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
                  By status
                </h4>
                <div
                  className="chart-wrap"
                  style={{ height: '200px' }}
                  role="img"
                  aria-label="Bar chart of review signals grouped by status"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={exceptions.byStatus} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                      <CartesianGrid stroke="#e9edf4" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fill: '#758197', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(value: string) => value.replace(/_/g, ' ')} />
                      <YAxis allowDecimals={false} tick={{ fill: '#758197', fontSize: 10 }} tickLine={false} axisLine={false} />
                      <Tooltip formatter={(value) => `${Number(value)} signal(s)`} contentStyle={TOOLTIP_STYLE} />
                      <Bar dataKey="count" name="Signals" radius={[4, 4, 0, 0]}>
                        {exceptions.byStatus.map((entry) => (
                          <Cell key={entry.name} fill={statusColor(entry.name)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <h4 className="chart-subheading">Top review signals</h4>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Institution</th>
                    <th scope="col">Period</th>
                    <th scope="col">Indicator</th>
                    <th scope="col">Severity</th>
                    <th scope="col">Status</th>
                    <th scope="col">Observed</th>
                    <th scope="col">Threshold</th>
                  </tr>
                </thead>
                <tbody>
                  {exceptions.items.slice(0, 10).map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="institution-name">{item.institutionName}</div>
                        <div className="panel-caption">{item.institutionId}</div>
                      </td>
                      <td>{item.period}</td>
                      <td style={{ textTransform: 'capitalize' }}>{item.indicator.replace(/_/g, ' ')}</td>
                      <td>
                        <span className={severityClass(item.severity)}>{item.severity}</span>
                      </td>
                      <td>
                        <span className="status-pill">{item.status.replace(/_/g, ' ')}</span>
                      </td>
                      <td>{item.observed.toFixed(2)}</td>
                      <td>{item.threshold.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </section>
  );
}

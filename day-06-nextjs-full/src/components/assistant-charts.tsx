'use client';

import type { ReactNode } from 'react';
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

type AnyRecord = Record<string, unknown>;

const COLORS = {
  teal: '#087c70',
  cyan: '#0891b2',
  amber: '#a45b12',
  crimson: '#b42332',
  slate: '#64748b',
};

const PALETTE = [COLORS.teal, COLORS.cyan, COLORS.amber, COLORS.crimson, COLORS.slate];

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function records(value: unknown): AnyRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function hasNumber(value: AnyRecord, key: string): boolean {
  return numberValue(value[key]) !== null;
}

function readableLabel(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ChartCard({
  title,
  description,
  height = 220,
  children,
}: {
  title: string;
  description: string;
  height?: number;
  children: ReactNode;
}) {
  return (
    <figure
      className="assistant-chart"
      style={{
        margin: 0,
        border: '1px solid var(--line)',
        borderRadius: 12,
        padding: '10px 12px 6px',
        background: 'var(--card)',
      }}
    >
      <figcaption
        style={{ marginBottom: 6, fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}
      >
        {title}
      </figcaption>
      <div role="img" aria-label={description} style={{ width: '100%', height }}>
        {children}
      </div>
    </figure>
  );
}

function axisProps() {
  return {
    tick: { fontSize: 11, fill: COLORS.slate },
    stroke: 'var(--line)',
  };
}

function tooltipStyle() {
  return {
    contentStyle: {
      borderRadius: 8,
      border: '1px solid var(--line)',
      fontSize: 12,
    },
  };
}

function overviewCharts(result: AnyRecord): ReactNode[] {
  const trend = records(result.trend).map((row) => ({
    period: stringValue(row.period) ?? '',
    deposits: numberValue(row.depositsTzsBillions),
    loans: numberValue(row.loansTzsBillions),
    completeness: numberValue(row.completenessPercent),
    exceptions: numberValue(row.exceptions),
  }));

  const charts: ReactNode[] = [];
  if (trend.length > 0 && trend.some((row) => row.deposits !== null || row.loans !== null)) {
    charts.push(
      <ChartCard
        key="portfolio-totals"
        title="Portfolio deposits and loans"
        description="Line chart of synthetic portfolio deposits and loans by reporting period"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trend} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
            <XAxis dataKey="period" {...axisProps()} />
            <YAxis {...axisProps()} width={46} />
            <Tooltip {...tooltipStyle()} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="deposits" name="Deposits" stroke={COLORS.teal} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="loans" name="Loans" stroke={COLORS.cyan} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>,
    );
  }

  if (trend.length > 0 && trend.some((row) => row.completeness !== null || row.exceptions !== null)) {
    charts.push(
      <ChartCard
        key="portfolio-completeness"
        title="Completeness and review signals"
        description="Area chart of synthetic reporting completeness and open review signals by period"
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trend} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="completenessFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS.amber} stopOpacity={0.4} />
                <stop offset="100%" stopColor={COLORS.amber} stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="exceptionFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS.crimson} stopOpacity={0.35} />
                <stop offset="100%" stopColor={COLORS.crimson} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
            <XAxis dataKey="period" {...axisProps()} />
            <YAxis {...axisProps()} width={40} />
            <Tooltip {...tooltipStyle()} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area type="monotone" dataKey="completeness" name="Completeness %" stroke={COLORS.amber} fill="url(#completenessFill)" strokeWidth={2} />
            <Area type="monotone" dataKey="exceptions" name="Review signals" stroke={COLORS.crimson} fill="url(#exceptionFill)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>,
    );
  }

  return charts;
}

function analyticsCharts(result: AnyRecord): ReactNode[] {
  const trend = records(result.trend).map((row) => ({
    period: stringValue(row.period) ?? '',
    deposits: numberValue(row.deposits),
    loans: numberValue(row.loans),
    completeness: numberValue(row.completeness),
  }));
  const indicators = records(result.indicators)
    .map((row) => ({
      name: stringValue(row.label) ?? readableLabel(stringValue(row.id) ?? 'Indicator'),
      value: numberValue(row.value),
    }))
    .filter((row): row is { name: string; value: number } => row.value !== null);

  const charts: ReactNode[] = [];
  if (trend.length > 0 && trend.some((row) => row.deposits !== null || row.loans !== null || row.completeness !== null)) {
    charts.push(
      <ChartCard
        key="analytics-trend"
        title="Indicator trend"
        description="Line chart of synthetic deposits, loans and reporting completeness over time"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trend} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
            <XAxis dataKey="period" {...axisProps()} />
            <YAxis {...axisProps()} width={46} />
            <Tooltip {...tooltipStyle()} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="deposits" name="Deposits" stroke={COLORS.teal} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="loans" name="Loans" stroke={COLORS.cyan} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="completeness" name="Completeness %" stroke={COLORS.amber} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>,
    );
  }

  if (indicators.length > 0) {
    charts.push(
      <ChartCard
        key="analytics-indicators"
        title="Indicator values"
        description="Bar chart of synthetic indicator values for the selected period"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={indicators} margin={{ top: 8, right: 12, bottom: 36, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
            <XAxis dataKey="name" interval={0} angle={-25} textAnchor="end" height={52} {...axisProps()} />
            <YAxis {...axisProps()} width={46} />
            <Tooltip {...tooltipStyle()} />
            <Bar dataKey="value" name="Value" radius={[4, 4, 0, 0]}>
              {indicators.map((entry, index) => (
                <Cell key={entry.name} fill={PALETTE[index % PALETTE.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>,
    );
  }

  return charts;
}

function institutionCharts(result: AnyRecord): ReactNode[] {
  const reports = records(result.reports)
    .map((row) => ({
      period: stringValue(row.period) ?? '',
      deposits: numberValue(row.depositsTzsBillions),
      loans: numberValue(row.loansTzsBillions),
      car: numberValue(row.capitalAdequacyRatioPercent),
      npl: numberValue(row.nplRatioPercent),
      liquidity: numberValue(row.liquidityRatioPercent),
    }))
    .sort((left, right) => left.period.localeCompare(right.period));

  const charts: ReactNode[] = [];
  if (reports.length > 0 && reports.some((row) => row.deposits !== null || row.loans !== null)) {
    charts.push(
      <ChartCard
        key="institution-positions"
        title="Reported deposits and loans"
        description="Line chart of synthetic institution deposits and loans across reporting periods"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={reports} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
            <XAxis dataKey="period" {...axisProps()} />
            <YAxis {...axisProps()} width={46} />
            <Tooltip {...tooltipStyle()} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="deposits" name="Deposits" stroke={COLORS.teal} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="loans" name="Loans" stroke={COLORS.cyan} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>,
    );
  }

  if (reports.length > 0 && reports.some((row) => row.car !== null || row.npl !== null || row.liquidity !== null)) {
    charts.push(
      <ChartCard
        key="institution-ratios"
        title="Capital, NPL and liquidity ratios"
        description="Line chart of synthetic capital adequacy, NPL and liquidity ratios across reporting periods"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={reports} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
            <XAxis dataKey="period" {...axisProps()} />
            <YAxis {...axisProps()} width={40} />
            <Tooltip {...tooltipStyle()} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="car" name="Capital adequacy %" stroke={COLORS.teal} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="npl" name="NPL %" stroke={COLORS.crimson} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="liquidity" name="Liquidity %" stroke={COLORS.cyan} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>,
    );
  }

  return charts;
}

function rankingCharts(result: AnyRecord): ReactNode[] {
  const metric = stringValue(result.metric) ?? 'value';
  const items = records(result.items)
    .map((row) => ({
      name: stringValue(row.name) ?? stringValue(row.institutionId) ?? 'Institution',
      value: numberValue(row.value),
    }))
    .filter((row): row is { name: string; value: number } => row.value !== null);

  if (items.length === 0) return [];

  return [
    <ChartCard
      key="ranking"
      title={`Institutions by ${readableLabel(metric).toLowerCase()}`}
      description={`Horizontal bar chart ranking synthetic institutions by ${readableLabel(metric).toLowerCase()}`}
      height={Math.max(200, Math.min(360, items.length * 26))}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={items} layout="vertical" margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" horizontal={false} />
          <XAxis type="number" {...axisProps()} />
          <YAxis type="category" dataKey="name" width={124} tick={{ fontSize: 11, fill: COLORS.slate }} stroke="var(--line)" />
          <Tooltip {...tooltipStyle()} />
          <Bar dataKey="value" name={readableLabel(metric)} radius={[0, 4, 4, 0]}>
            {items.map((entry, index) => (
              <Cell key={entry.name} fill={PALETTE[index % PALETTE.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>,
  ];
}

function comparisonCharts(result: AnyRecord): ReactNode[] {
  const institutions = records(result.institutions).map((row) => ({
    name: stringValue(row.name) ?? stringValue(row.institutionId) ?? 'Institution',
    deposits: numberValue(row.depositsTzsBillions),
    car: numberValue(row.capitalAdequacyRatioPercent),
    npl: numberValue(row.nplRatioPercent),
  }));

  const charts: ReactNode[] = [];
  if (institutions.length > 0 && institutions.some((row) => row.deposits !== null)) {
    charts.push(
      <ChartCard
        key="compare-deposits"
        title="Deposits comparison"
        description="Bar chart comparing synthetic deposits across institutions"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={institutions} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
            <XAxis dataKey="name" {...axisProps()} />
            <YAxis {...axisProps()} width={46} />
            <Tooltip {...tooltipStyle()} />
            <Bar dataKey="deposits" name="Deposits (TZS bn)" radius={[4, 4, 0, 0]}>
              {institutions.map((entry, index) => (
                <Cell key={entry.name} fill={PALETTE[index % PALETTE.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>,
    );
  }

  if (institutions.length > 0 && institutions.some((row) => row.car !== null || row.npl !== null)) {
    charts.push(
      <ChartCard
        key="compare-ratios"
        title="Capital and NPL comparison"
        description="Bar chart comparing synthetic capital adequacy and NPL ratios across institutions"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={institutions} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
            <XAxis dataKey="name" {...axisProps()} />
            <YAxis {...axisProps()} width={40} />
            <Tooltip {...tooltipStyle()} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="car" name="Capital adequacy %" fill={COLORS.teal} radius={[4, 4, 0, 0]} />
            <Bar dataKey="npl" name="NPL %" fill={COLORS.crimson} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>,
    );
  }

  return charts;
}

function exceptionCharts(result: AnyRecord): ReactNode[] {
  const items = records(result.items);
  if (items.length === 0) return [];

  const severityOrder = ['critical', 'high', 'medium', 'low'];
  const statusOrder = ['open', 'under_review', 'resolved'];
  const countField = (field: string): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const item of items) {
      const value = stringValue(item[field]);
      if (!value) continue;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return counts;
  };

  const severityCounts = countField('severity');
  const statusCounts = countField('status');
  const severityData = severityOrder.map((name) => ({ name: readableLabel(name), count: severityCounts.get(name) ?? 0 }));
  const statusData = statusOrder.map((name) => ({ name: readableLabel(name), count: statusCounts.get(name) ?? 0 }));

  const charts: ReactNode[] = [
    <ChartCard
      key="exception-severity"
      title="Exceptions by severity"
      description="Bar chart of returned synthetic review signals by severity"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={severityData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
          <XAxis dataKey="name" {...axisProps()} />
          <YAxis allowDecimals={false} {...axisProps()} width={32} />
          <Tooltip {...tooltipStyle()} />
          <Bar dataKey="count" name="Signals" radius={[4, 4, 0, 0]}>
            {severityData.map((entry, index) => (
              <Cell key={entry.name} fill={[COLORS.crimson, COLORS.amber, COLORS.cyan, COLORS.teal][index] ?? COLORS.slate} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>,
  ];

  if (statusData.some((entry) => entry.count > 0)) {
    charts.push(
      <ChartCard
        key="exception-status"
        title="Exceptions by status"
        description="Bar chart of returned synthetic review signals by workflow status"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={statusData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
            <XAxis dataKey="name" {...axisProps()} />
            <YAxis allowDecimals={false} {...axisProps()} width={32} />
            <Tooltip {...tooltipStyle()} />
            <Bar dataKey="count" name="Signals" radius={[4, 4, 0, 0]}>
              {statusData.map((entry, index) => (
                <Cell key={entry.name} fill={[COLORS.amber, COLORS.cyan, COLORS.teal][index] ?? COLORS.slate} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>,
    );
  }

  return charts;
}

function institutionsCharts(result: AnyRecord): ReactNode[] {
  const items = records(result.items)
    .map((row) => ({
      name: stringValue(row.name) ?? stringValue(row.institutionId) ?? 'Institution',
      openExceptions: numberValue(row.openExceptions),
    }))
    .filter((row): row is { name: string; openExceptions: number } => row.openExceptions !== null)
    .sort((left, right) => right.openExceptions - left.openExceptions)
    .slice(0, 12);

  if (items.length === 0) return [];

  return [
    <ChartCard
      key="institution-open-exceptions"
      title="Open exceptions by institution"
      description="Horizontal bar chart of open synthetic review signals by institution"
      height={Math.max(200, Math.min(320, items.length * 24))}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={items} layout="vertical" margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" horizontal={false} />
          <XAxis type="number" allowDecimals={false} {...axisProps()} />
          <YAxis type="category" dataKey="name" width={124} tick={{ fontSize: 11, fill: COLORS.slate }} stroke="var(--line)" />
          <Tooltip {...tooltipStyle()} />
          <Bar dataKey="openExceptions" name="Open exceptions" radius={[0, 4, 4, 0]}>
            {items.map((entry, index) => (
              <Cell key={entry.name} fill={PALETTE[index % PALETTE.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>,
  ];
}

export function AssistantCharts({ tool, result }: { tool: string; result: unknown }) {
  let charts: ReactNode[] = [];

  if (isRecord(result)) {
    switch (tool) {
      case 'get_portfolio_overview':
        charts = overviewCharts(result);
        break;
      case 'get_analytics':
        charts = analyticsCharts(result);
        break;
      case 'get_institution':
        charts = institutionCharts(result);
        break;
      case 'rank_institutions':
        charts = rankingCharts(result);
        break;
      case 'compare_institutions':
        charts = comparisonCharts(result);
        break;
      case 'list_exceptions':
        charts = exceptionCharts(result);
        break;
      case 'list_institutions':
        charts = institutionsCharts(result);
        break;
      default:
        return null;
    }
  } else {
    switch (tool) {
      case 'get_portfolio_overview':
      case 'get_analytics':
      case 'get_institution':
      case 'rank_institutions':
      case 'compare_institutions':
      case 'list_exceptions':
      case 'list_institutions':
        break;
      default:
        return null;
    }
  }

  if (charts.length === 0) {
    return (
      <p className="panel-caption">No chartable data was returned for this result.</p>
    );
  }

  return (
    <div
      className="assistant-charts"
      style={{ display: 'grid', gap: 12, marginTop: 14 }}
    >
      {charts}
    </div>
  );
}

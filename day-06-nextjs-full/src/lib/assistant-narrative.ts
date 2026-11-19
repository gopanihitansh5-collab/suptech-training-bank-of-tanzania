export interface AssistantNarrative {
  headline: string;
  summary: string;
  detail: string;
  facts: Array<{ label: string; value: string; detail?: string }>;
  followUps: string[];
}

type RecordValue = Record<string, unknown>;

const NUMBER_FORMAT = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });

const RANK_METRIC_LABELS: Record<string, string> = {
  open_exceptions: 'open exceptions',
  npl_ratio: 'NPL ratio',
  capital_adequacy: 'capital adequacy',
  deposits: 'deposits',
};

const DOMAIN_TERMS = [
  'deposit',
  'loan',
  'capital',
  'npl',
  'liquidity',
  'completeness',
  'exception',
  'report',
  'indicator',
  'threshold',
  'ratio',
  'sector',
];

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'has', 'are',
  'was', 'were', 'will', 'would', 'could', 'should', 'about', 'into', 'over',
  'under', 'than', 'then', 'them', 'they', 'their', 'there', 'here', 'what',
  'when', 'where', 'which', 'who', 'why', 'how', 'show', 'list', 'find',
  'give', 'tell', 'explain', 'summarize', 'summarise', 'latest', 'data',
]);

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): RecordValue | null {
  return isRecord(value) ? value : null;
}

function records(value: unknown): RecordValue[] {
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

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'not available';
  return NUMBER_FORMAT.format(value);
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'not available';
  return `${formatNumber(value)}%`;
}

function formatUnit(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'not available';
  return `${formatNumber(value)} ${unit}`;
}

function formatDelta(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'not available';
  if (value === 0) return unit ? `0 ${unit}` : '0';
  const sign = value > 0 ? '+' : '-';
  return `${sign}${formatNumber(Math.abs(value))}${unit ? ` ${unit}` : ''}`;
}

function presentValue(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'not available';
  if (unit === '%') return formatPercent(value);
  if (unit) return formatUnit(value, unit);
  return formatNumber(value);
}

function labelize(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${formatNumber(count)} ${count === 1 ? singular : pluralForm}`;
}

function difference(next: unknown, previous: unknown): number | null {
  const left = numberValue(next);
  const right = numberValue(previous);
  return left !== null && right !== null ? left - right : null;
}

function mean(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) return null;
  return present.reduce((total, value) => total + value, 0) / present.length;
}

function countBy(rows: RecordValue[], key: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = stringValue(row[key]);
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function countLookup(counts: Map<string, number>, key: string): number {
  return counts.get(key) ?? 0;
}

function topCount(counts: Map<string, number>): { key: string; count: number } | null {
  let best: { key: string; count: number } | null = null;
  for (const [key, count] of counts) {
    if (!best || count > best.count) best = { key, count };
  }
  return best;
}

interface Extreme {
  row: RecordValue;
  value: number;
}

function extreme(
  rows: RecordValue[],
  key: string,
  mode: 'min' | 'max',
): Extreme | null {
  let best: Extreme | null = null;
  for (const row of rows) {
    const value = numberValue(row[key]);
    if (value === null) continue;
    if (!best || (mode === 'max' ? value > best.value : value < best.value)) {
      best = { row, value };
    }
  }
  return best;
}

interface Stats {
  min: number;
  max: number;
  average: number;
  count: number;
}

function stats(values: Array<number | null>): Stats | null {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) return null;
  return {
    min: Math.min(...present),
    max: Math.max(...present),
    average: present.reduce((total, value) => total + value, 0) / present.length,
    count: present.length,
  };
}

function rowName(row: RecordValue): string {
  return (
    stringValue(row.name) ??
    stringValue(row.institutionName) ??
    stringValue(row.institutionId) ??
    'unknown institution'
  );
}

function rowId(row: RecordValue): string {
  return stringValue(row.institutionId) ?? '';
}

function rowLabel(row: RecordValue): string {
  const name = rowName(row);
  const id = rowId(row);
  return id && !name.includes(id) ? `${name} (${id})` : name;
}

function describeChange(subject: string, value: number | null, unit: string): string {
  if (value === null) return `${subject} could not be compared across the trend window`;
  if (value === 0) return `${subject} were unchanged`;
  const direction = value > 0 ? 'rose' : 'fell';
  const amount = unit ? `${formatNumber(Math.abs(value))} ${unit}` : formatNumber(Math.abs(value));
  return `${subject} ${direction} by ${amount}`;
}

function narrateOverview(result: RecordValue): AssistantNarrative {
  const period = stringValue(result.period);
  const summary = asRecord(result.summary) ?? {};
  const trend = records(result.trend);

  if (!period) {
    return {
      headline: 'Portfolio overview: no reporting periods available',
      summary: 'No synthetic reporting periods are available, so portfolio totals cannot be computed.',
      detail: 'The training dataset does not yet contain any institution reports.',
      facts: [],
      followUps: [
        'List synthetic institutions',
        'Search the training corpus for reporting guidance',
        'Show the available analytics periods',
      ],
    };
  }

  const institutions = numberValue(summary.institutions);
  const received = numberValue(summary.reportsReceived);
  const expected = numberValue(summary.reportsExpected);
  const open = numberValue(summary.openExceptions) ?? 0;
  const critical = numberValue(summary.criticalExceptions) ?? 0;
  const deposits = numberValue(summary.depositsTzsBillions);
  const loans = numberValue(summary.loansTzsBillions);
  const completeness = numberValue(summary.completenessPercent);
  const ldr =
    deposits !== null && deposits !== 0 && loans !== null
      ? (loans / deposits) * 100
      : null;
  const criticalShare = open > 0 ? (critical / open) * 100 : null;

  const first = trend[0] ?? null;
  const last = trend.length > 0 ? trend[trend.length - 1] : null;
  const firstPeriod = first ? stringValue(first.period) : null;
  const lastPeriod = last ? stringValue(last.period) : null;
  const depositChange = first && last ? difference(last.depositsTzsBillions, first.depositsTzsBillions) : null;
  const loanChange = first && last ? difference(last.loansTzsBillions, first.loansTzsBillions) : null;
  const exceptionChange = first && last ? difference(last.exceptions, first.exceptions) : null;
  const completenessAverage = mean(trend.map((row) => numberValue(row.completenessPercent)));
  const depositAverage = mean(trend.map((row) => numberValue(row.depositsTzsBillions)));
  const exceptionAverage = mean(trend.map((row) => numberValue(row.exceptions)));

  const headline = `Portfolio ${period}: ${formatNumber(institutions)} institutions, ${formatNumber(received)}/${formatNumber(expected)} reports, ${formatNumber(open)} open signals`;

  const summaryText = [
    `Deposits total ${formatUnit(deposits, 'TZS bn')} against ${formatUnit(loans, 'TZS bn')} in loans, giving a loan-to-deposit ratio of ${formatPercent(ldr)}.`,
    `Average reporting completeness was ${formatPercent(completeness)} with ${formatNumber(received)} of ${formatNumber(expected)} reports received.`,
    `${formatNumber(open)} open review signals were recorded, ${formatNumber(critical)} of them critical (${criticalShare === null ? 'not available' : `${formatNumber(criticalShare)}% of open signals`}).`,
    `${describeChange('Deposits', depositChange, 'TZS bn')}, ${describeChange('loans', loanChange, 'TZS bn')} and ${describeChange('review signals', exceptionChange, '')} across ${plural(trend.length, 'period')}.`,
  ].join(' ');

  const detail = firstPeriod && lastPeriod
    ? `The trend window runs from ${firstPeriod} to ${lastPeriod}. Deposits averaged ${formatUnit(depositAverage, 'TZS bn')} and completeness averaged ${formatPercent(completenessAverage)} over those periods, while review signals averaged ${formatNumber(exceptionAverage)} per period.`
    : `Only ${plural(trend.length, 'period')} of trend data is available, so period-to-period changes cannot be computed.`;

  const facts: AssistantNarrative['facts'] = [
    { label: 'Reporting period', value: period },
    { label: 'Institutions', value: formatNumber(institutions) },
    { label: 'Reports received', value: `${formatNumber(received)} of ${formatNumber(expected)}` },
    { label: 'Deposits', value: formatUnit(deposits, 'TZS bn') },
    { label: 'Loans', value: formatUnit(loans, 'TZS bn') },
    { label: 'Loan-to-deposit ratio', value: formatPercent(ldr) },
    { label: 'Average completeness', value: formatPercent(completeness) },
    { label: 'Open review signals', value: formatNumber(open) },
    {
      label: 'Critical review signals',
      value: formatNumber(critical),
      detail: criticalShare === null ? 'no open signals' : `${formatNumber(criticalShare)}% of open signals`,
    },
    {
      label: 'Deposit change',
      value: formatDelta(depositChange, 'TZS bn'),
      detail: firstPeriod && lastPeriod ? `${firstPeriod} to ${lastPeriod}` : undefined,
    },
    {
      label: 'Loan change',
      value: formatDelta(loanChange, 'TZS bn'),
      detail: firstPeriod && lastPeriod ? `${firstPeriod} to ${lastPeriod}` : undefined,
    },
    {
      label: 'Review-signal change',
      value: formatDelta(exceptionChange, ''),
      detail: firstPeriod && lastPeriod ? `${firstPeriod} to ${lastPeriod}` : undefined,
    },
    {
      label: 'Average completeness in trend',
      value: formatPercent(completenessAverage),
      detail: plural(trend.length, 'period'),
    },
  ];

  return {
    headline,
    summary: summaryText,
    detail,
    facts,
    followUps: [
      `List critical open exceptions for ${period}`,
      'Show the 12-period deposits trend',
      'Rank institutions by capital adequacy',
    ],
  };
}

function narrateExceptions(result: RecordValue): AssistantNarrative {
  const items = records(result.items);
  const total = numberValue(result.total) ?? items.length;
  const page = numberValue(result.page);
  const pageSize = numberValue(result.pageSize) ?? items.length;
  const severityCounts = countBy(items, 'severity');
  const statusCounts = countBy(items, 'status');
  const institutionCounts = new Map<string, number>();
  const institutionIdCounts = new Map<string, number>();
  for (const item of items) {
    const name = stringValue(item.institutionName);
    const id = stringValue(item.institutionId);
    if (name) {
      const label = id && !name.includes(id) ? `${name} (${id})` : name;
      institutionCounts.set(label, (institutionCounts.get(label) ?? 0) + 1);
    }
    if (id) institutionIdCounts.set(id, (institutionIdCounts.get(id) ?? 0) + 1);
  }
  const indicatorCounts = countBy(items, 'indicatorId');
  const periods = items
    .map((item) => stringValue(item.period))
    .filter((value): value is string => value !== null)
    .sort();
  const oldestPeriod = periods[0] ?? null;
  const newestPeriod = periods.length > 0 ? periods[periods.length - 1] : null;

  if (items.length === 0) {
    return {
      headline: 'Exceptions: no records returned',
      summary: 'No synthetic exceptions matched the requested filters; the returned page is empty.',
      detail: 'Widen the status, severity, institution or period filters, or summarize the portfolio for a broader view.',
      facts: [{ label: 'Matched exceptions', value: '0' }],
      followUps: [
        'List all open exceptions',
        'Show critical exceptions for the latest period',
        'Summarize the portfolio overview',
      ],
    };
  }

  const critical = countLookup(severityCounts, 'critical');
  const high = countLookup(severityCounts, 'high');
  const medium = countLookup(severityCounts, 'medium');
  const low = countLookup(severityCounts, 'low');
  const open = countLookup(statusCounts, 'open');
  const underReview = countLookup(statusCounts, 'under_review');
  const resolved = countLookup(statusCounts, 'resolved');
  const topInstitution = topCount(institutionCounts);
  const topInstitutionId = topCount(institutionIdCounts)?.key ?? items[0]?.institutionId;
  const topIndicator = topCount(indicatorCounts);
  const pageShare = total > 0 ? (items.length / total) * 100 : null;

  const subset = total > items.length
    ? `This page shows ${formatNumber(items.length)} of ${formatNumber(total)} matched signals (${formatPercent(pageShare)}); open the register for the remaining rows.`
    : `This page lists all ${plural(items.length, 'matched signal')}.`;

  const summaryText = [
    `${formatNumber(total)} synthetic review signals matched the filters. ${subset}`,
    topInstitution
      ? `The most frequent institution is ${topInstitution.key} with ${plural(topInstitution.count, 'signal')} and the most frequent indicator is ${topIndicator ? labelize(topIndicator.key) : 'not available'} with ${topIndicator ? plural(topIndicator.count, 'signal') : 'no signals'}.`
      : 'No institution or indicator frequencies are available on this page.',
    `Matching periods run from ${oldestPeriod ?? 'not available'} to ${newestPeriod ?? 'not available'}.`,
  ].join(' ');

  const topSignals = items.slice(0, 3).map((item, index) => {
    const institution = stringValue(item.institutionName) ?? stringValue(item.institutionId) ?? 'unknown institution';
    const indicator = stringValue(item.indicatorId);
    const observed = numberValue(item.observedValue);
    const threshold = numberValue(item.thresholdValue);
    return `${index + 1}. ${institution} - ${indicator ? labelize(indicator) : 'unknown indicator'} observed ${formatNumber(observed)} against threshold ${formatNumber(threshold)} (${stringValue(item.severity) ?? 'unknown severity'}, ${stringValue(item.status) ?? 'unknown status'}).`;
  });

  const detail = `Highest-priority signals on this page: ${topSignals.join(' ')}`;

  const facts: AssistantNarrative['facts'] = [
    { label: 'Matched exceptions', value: formatNumber(total) },
    {
      label: 'On this page',
      value: formatNumber(items.length),
      detail: `page ${formatNumber(page)} with page size ${formatNumber(pageSize)}`,
    },
    { label: 'Critical', value: formatNumber(critical) },
    { label: 'High', value: formatNumber(high) },
    { label: 'Medium', value: formatNumber(medium) },
    { label: 'Low', value: formatNumber(low) },
    { label: 'Open', value: formatNumber(open) },
    { label: 'Under review', value: formatNumber(underReview) },
    { label: 'Resolved', value: formatNumber(resolved) },
    {
      label: 'Top institution',
      value: topInstitution?.key ?? 'not available',
      detail: topInstitution ? plural(topInstitution.count, 'signal') : undefined,
    },
    {
      label: 'Top indicator',
      value: topIndicator ? labelize(topIndicator.key) : 'not available',
      detail: topIndicator ? plural(topIndicator.count, 'signal') : undefined,
    },
    { label: 'Oldest period', value: oldestPeriod ?? 'not available' },
    { label: 'Newest period', value: newestPeriod ?? 'not available' },
  ];

  return {
    headline: `Exceptions: ${formatNumber(total)} matched, ${formatNumber(critical)} critical, ${formatNumber(open)} open`,
    summary: summaryText,
    detail,
    facts,
    followUps: [
      `List critical open exceptions for ${newestPeriod ?? 'the latest period'}`,
      topInstitutionId ? `Show institution ${topInstitutionId}` : 'Rank institutions by open exceptions',
      'Break down open exceptions by institution',
    ],
  };
}

function narrateInstitution(result: RecordValue): AssistantNarrative {
  const institution = asRecord(result.institution) ?? {};
  const reports = records(result.reports).slice().sort((left, right) =>
    (stringValue(right.period) ?? '').localeCompare(stringValue(left.period) ?? ''),
  );
  const exceptions = records(result.exceptions);
  const id = stringValue(institution.institutionId) ?? 'institution';
  const name = stringValue(institution.name) ?? id;
  const type = stringValue(institution.type);
  const region = stringValue(institution.region);
  const status = stringValue(institution.status);
  const latest = reports[0] ?? null;
  const previous = reports[1] ?? null;
  const oldest = reports.length > 0 ? reports[reports.length - 1] : null;
  const latestPeriod = (latest ? stringValue(latest.period) : null) ?? stringValue(institution.latestPeriod);

  const deposits = latest ? numberValue(latest.depositsTzsBillions) : numberValue(institution.depositsTzsBillions);
  const loans = latest ? numberValue(latest.loansTzsBillions) : null;
  const car = latest ? numberValue(latest.capitalAdequacyRatioPercent) : numberValue(institution.capitalAdequacyRatioPercent);
  const npl = latest ? numberValue(latest.nplRatioPercent) : numberValue(institution.nplRatioPercent);
  const liquidity = latest ? numberValue(latest.liquidityRatioPercent) : null;
  const completeness = latest ? numberValue(latest.completenessPercent) : null;
  const ldr = deposits !== null && deposits !== 0 && loans !== null ? (loans / deposits) * 100 : null;

  const depositChange = latest && previous ? difference(latest.depositsTzsBillions, previous.depositsTzsBillions) : null;
  const loanChange = latest && previous ? difference(latest.loansTzsBillions, previous.loansTzsBillions) : null;
  const carChange = latest && previous ? difference(latest.capitalAdequacyRatioPercent, previous.capitalAdequacyRatioPercent) : null;
  const nplChange = latest && previous ? difference(latest.nplRatioPercent, previous.nplRatioPercent) : null;
  const liquidityChange = latest && previous ? difference(latest.liquidityRatioPercent, previous.liquidityRatioPercent) : null;
  const completenessChange = latest && previous ? difference(latest.completenessPercent, previous.completenessPercent) : null;

  const depositStats = stats(reports.map((row) => numberValue(row.depositsTzsBillions)));
  const nplStats = stats(reports.map((row) => numberValue(row.nplRatioPercent)));
  const depositTrend = latest && oldest ? difference(latest.depositsTzsBillions, oldest.depositsTzsBillions) : null;
  const nplTrend = latest && oldest ? difference(latest.nplRatioPercent, oldest.nplRatioPercent) : null;

  const severityCounts = countBy(exceptions, 'severity');
  const statusCounts = countBy(exceptions, 'status');
  const critical = countLookup(severityCounts, 'critical');
  const high = countLookup(severityCounts, 'high');
  const medium = countLookup(severityCounts, 'medium');
  const low = countLookup(severityCounts, 'low');
  const open = countLookup(statusCounts, 'open');
  const underReview = countLookup(statusCounts, 'under_review');
  const resolved = countLookup(statusCounts, 'resolved');

  const headline = `${name} (${id}): ${formatUnit(deposits, 'TZS bn')} deposits, CAR ${formatPercent(car)}, NPL ${formatPercent(npl)}`;

  const profile = `${name} is a ${type ?? 'synthetic'} institution in ${region ?? 'an unspecified region'} with ${status ?? 'an unspecified'} status.`;
  const latestSentence = latestPeriod
    ? `In ${latestPeriod} it reported deposits of ${formatUnit(deposits, 'TZS bn')} and loans of ${formatUnit(loans, 'TZS bn')}, an LDR of ${formatPercent(ldr)}. Capital adequacy was ${formatPercent(car)}, NPL ${formatPercent(npl)}, liquidity ${formatPercent(liquidity)} and completeness ${formatPercent(completeness)}.`
    : `No period-by-period reports were returned; the institution snapshot shows ${formatUnit(deposits, 'TZS bn')} in deposits, capital adequacy of ${formatPercent(car)} and NPL of ${formatPercent(npl)}.`;
  const comparison = previous
    ? `Compared with ${stringValue(previous.period) ?? 'the previous period'}, deposits changed by ${formatDelta(depositChange, 'TZS bn')}, loans by ${formatDelta(loanChange, 'TZS bn')}, capital adequacy by ${formatDelta(carChange, 'pp')}, NPL by ${formatDelta(nplChange, 'pp')}, liquidity by ${formatDelta(liquidityChange, 'pp')} and completeness by ${formatDelta(completenessChange, 'pp')}.`
    : 'No previous period is available for comparison.';
  const exceptionSentence = exceptions.length > 0
    ? `${exceptions.length} synthetic review signals were returned: ${critical} critical, ${high} high, ${medium} medium and ${low} low; ${open} are open, ${underReview} under review and ${resolved} resolved.`
    : 'No synthetic review signals were returned for this institution.';

  const summaryText = [profile, latestSentence, comparison, exceptionSentence].join(' ');

  const detail = reports.length >= 2
    ? `Over ${plural(reports.length, 'reported period')} from ${stringValue(oldest?.period) ?? 'not available'} to ${latestPeriod ?? 'not available'}, ${describeChange('deposits', depositTrend, 'TZS bn')} and ${describeChange('NPL', nplTrend, 'pp')}. Deposits ranged from ${formatUnit(depositStats?.min, 'TZS bn')} to ${formatUnit(depositStats?.max, 'TZS bn')} with an average of ${formatUnit(depositStats?.average, 'TZS bn')}; NPL ranged from ${formatPercent(nplStats?.min)} to ${formatPercent(nplStats?.max)} with an average of ${formatPercent(nplStats?.average)}.`
    : 'There are not enough reported periods to describe a trend.';

  const facts: AssistantNarrative['facts'] = [
    { label: 'Institution', value: `${name} (${id})`, detail: [type, region, status].filter(Boolean).join(' · ') },
    { label: 'Latest period', value: latestPeriod ?? 'not available' },
    { label: 'Deposits', value: formatUnit(deposits, 'TZS bn'), detail: `change ${formatDelta(depositChange, 'TZS bn')}` },
    { label: 'Loans', value: formatUnit(loans, 'TZS bn'), detail: `change ${formatDelta(loanChange, 'TZS bn')}` },
    { label: 'Loan-to-deposit ratio', value: formatPercent(ldr) },
    { label: 'Capital adequacy', value: formatPercent(car), detail: `change ${formatDelta(carChange, 'pp')}` },
    { label: 'NPL ratio', value: formatPercent(npl), detail: `change ${formatDelta(nplChange, 'pp')}` },
    { label: 'Liquidity', value: formatPercent(liquidity), detail: `change ${formatDelta(liquidityChange, 'pp')}` },
    { label: 'Completeness', value: formatPercent(completeness), detail: `change ${formatDelta(completenessChange, 'pp')}` },
    {
      label: 'Deposits over 12 periods',
      value: `${formatUnit(depositStats?.min, 'TZS bn')} min / ${formatUnit(depositStats?.max, 'TZS bn')} max / ${formatUnit(depositStats?.average, 'TZS bn')} average`,
      detail: depositStats ? plural(depositStats.count, 'report') : undefined,
    },
    {
      label: 'NPL over 12 periods',
      value: `${formatPercent(nplStats?.min)} min / ${formatPercent(nplStats?.max)} max / ${formatPercent(nplStats?.average)} average`,
      detail: nplStats ? plural(nplStats.count, 'report') : undefined,
    },
    { label: 'Open exceptions', value: formatNumber(open) },
    { label: 'Critical exceptions', value: formatNumber(critical) },
    { label: 'Under review', value: formatNumber(underReview) },
    { label: 'Resolved', value: formatNumber(resolved) },
  ];

  return {
    headline,
    summary: summaryText,
    detail,
    facts,
    followUps: [
      `Show the 12-period NPL trend for ${id}`,
      `List critical open exceptions for ${id}`,
      `Compare ${id} with another institution`,
    ],
  };
}

function narrateAnalytics(result: RecordValue): AssistantNarrative {
  const period = stringValue(result.period);
  const indicatorRecords = records(result.indicators);
  const trend = records(result.trend);
  const institution = asRecord(result.institution);
  const institutionId = institution ? stringValue(institution.institutionId) : null;

  if (!period) {
    return {
      headline: 'Analytics: no reporting periods available',
      summary: 'No synthetic analytics periods are available in the dataset.',
      detail: 'Sector indicators appear once institution reports have been seeded.',
      facts: [],
      followUps: [
        'Summarize the portfolio overview',
        'List synthetic institutions',
        'Search the training corpus for indicator definitions',
      ],
    };
  }

  const indicators = indicatorRecords.map((entry) => ({
    id: stringValue(entry.id),
    label: stringValue(entry.label) ?? labelize(stringValue(entry.id) ?? 'indicator'),
    unit: stringValue(entry.unit) ?? '',
    value: numberValue(entry.value),
  }));

  const numericValues = indicators
    .map((indicator) => indicator.value)
    .filter((value): value is number => value !== null);
  const valueStats = stats(numericValues);
  const indicatorValue = (id: string): number | null =>
    indicators.find((indicator) => indicator.id === id)?.value ?? null;

  const deposits = indicatorValue('deposits');
  const loans = indicatorValue('loans');
  const npl = indicatorValue('npl_ratio');
  const car = indicatorValue('capital_adequacy');
  const completeness = indicatorValue('completeness');

  const first = trend[0] ?? null;
  const last = trend.length > 0 ? trend[trend.length - 1] : null;
  const firstPeriod = first ? stringValue(first.period) : null;
  const lastPeriod = last ? stringValue(last.period) : null;
  const depositChange = first && last ? difference(last.deposits, first.deposits) : null;
  const loanChange = first && last ? difference(last.loans, first.loans) : null;
  const completenessChange = first && last ? difference(last.completeness, first.completeness) : null;

  const comparisons: string[] = [];
  if (institution) {
    const institutionDeposits = numberValue(institution.depositsTzsBillions);
    const institutionCar = numberValue(institution.capitalAdequacyRatioPercent);
    const institutionNpl = numberValue(institution.nplRatioPercent);
    const label = institutionId ?? 'The selected institution';
    if (institutionDeposits !== null && deposits !== null) {
      comparisons.push(`${label} reports ${formatUnit(institutionDeposits, 'TZS bn')} in deposits versus a sector value of ${formatUnit(deposits, 'TZS bn')} (difference ${formatDelta(institutionDeposits - deposits, 'TZS bn')}).`);
    }
    if (institutionCar !== null && car !== null) {
      comparisons.push(`Its capital adequacy of ${formatPercent(institutionCar)} compares with a sector value of ${formatPercent(car)} (difference ${formatDelta(institutionCar - car, 'pp')}).`);
    }
    if (institutionNpl !== null && npl !== null) {
      comparisons.push(`Its NPL ratio of ${formatPercent(institutionNpl)} compares with a sector value of ${formatPercent(npl)} (difference ${formatDelta(institutionNpl - npl, 'pp')}).`);
    }
  }

  const headline = institutionId
    ? `Analytics ${period} for ${institutionId}: deposits ${formatUnit(deposits, 'TZS bn')}, NPL ${formatPercent(npl)}`
    : `Analytics ${period}: ${formatNumber(indicators.length)} sector indicators, deposits ${formatUnit(deposits, 'TZS bn')}, NPL ${formatPercent(npl)}`;

  const summaryText = [
    `Across ${plural(indicators.length, 'sector indicator')} for ${period}, deposits were ${formatUnit(deposits, 'TZS bn')}, loans ${formatUnit(loans, 'TZS bn')}, NPL ${formatPercent(npl)}, capital adequacy ${formatPercent(car)} and completeness ${formatPercent(completeness)}.`,
    valueStats
      ? `Numeric sector values ranged from ${formatNumber(valueStats.min)} to ${formatNumber(valueStats.max)} with an average of ${formatNumber(valueStats.average)} (units vary across indicators).`
      : 'No numeric sector values were returned.',
    trend.length >= 2
      ? `Across ${plural(trend.length, 'period')} (${firstPeriod} to ${lastPeriod}), ${describeChange('deposits', depositChange, 'TZS bn')}, ${describeChange('loans', loanChange, 'TZS bn')} and ${describeChange('completeness', completenessChange, 'pp')}.`
      : 'No multi-period trend is available for comparison.',
    comparisons.join(' '),
  ].filter(Boolean).join(' ');

  const detail = trend.length >= 2
    ? `The trend starts at ${firstPeriod ?? 'not available'} and ends at ${lastPeriod ?? 'not available'}. Sector deposits changed by ${formatDelta(depositChange, 'TZS bn')}, loans by ${formatDelta(loanChange, 'TZS bn')} and completeness by ${formatDelta(completenessChange, 'pp')} over that window.`
    : 'Only one analytics period is available, so trend changes cannot be computed.';

  const facts: AssistantNarrative['facts'] = [
    { label: 'Reporting period', value: period },
    { label: 'Sector indicators', value: formatNumber(indicators.length) },
    ...indicators.map((indicator) => ({
      label: indicator.label,
      value: presentValue(indicator.value, indicator.unit),
      detail: indicator.id ?? undefined,
    })),
    {
      label: 'Numeric range',
      value: valueStats ? `${formatNumber(valueStats.min)} to ${formatNumber(valueStats.max)}` : 'not available',
      detail: 'across sector indicators',
    },
    { label: 'Numeric average', value: formatNumber(valueStats?.average) },
    { label: 'Deposit change', value: formatDelta(depositChange, 'TZS bn') },
    { label: 'Loan change', value: formatDelta(loanChange, 'TZS bn') },
    { label: 'Completeness change', value: formatDelta(completenessChange, 'pp') },
  ];

  return {
    headline,
    summary: summaryText,
    detail,
    facts,
    followUps: [
      'Show the 12-period deposits trend',
      'Rank institutions by NPL ratio',
      institutionId ? `Show institution ${institutionId}` : `List critical open exceptions for ${period}`,
    ],
  };
}

function narrateInstitutions(result: RecordValue): AssistantNarrative {
  const items = records(result.items);
  const total = numberValue(result.total) ?? items.length;

  if (items.length === 0) {
    return {
      headline: 'Institutions: no records returned',
      summary: 'No synthetic institutions matched the directory query.',
      detail: 'Try a broader identifier or name fragment.',
      facts: [{ label: 'Matched institutions', value: '0' }],
      followUps: [
        'List all synthetic institutions',
        'Rank institutions by deposits',
        'Summarize the portfolio overview',
      ],
    };
  }

  const statusCounts = countBy(items, 'status');
  const tierCounts = countBy(items, 'tier');
  const regions = new Set(
    items
      .map((item) => stringValue(item.region))
      .filter((value): value is string => value !== null),
  );
  const openExceptions = items.reduce(
    (sum, item) => sum + (numberValue(item.openExceptions) ?? 0),
    0,
  );
  const highestDeposits = extreme(items, 'depositsTzsBillions', 'max');
  const highestNpl = extreme(items, 'nplRatioPercent', 'max');
  const lowestCar = extreme(items, 'capitalAdequacyRatioPercent', 'min');
  const active = countLookup(statusCounts, 'active');
  const monitoring = countLookup(statusCounts, 'monitoring');
  const tierSummary = [...tierCounts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([tier, count]) => `${tier}: ${formatNumber(count)}`)
    .join(', ');

  const headline = `Institutions: ${formatNumber(total)} matched across ${plural(regions.size, 'region')}, ${formatNumber(openExceptions)} open signals on this page`;

  const summaryText = [
    `${formatNumber(total)} synthetic institutions matched; the returned page lists ${formatNumber(items.length)}.`,
    `${formatNumber(active)} are active and ${formatNumber(monitoring)} monitoring across ${plural(regions.size, 'region')}.`,
    `Page open signals total ${formatNumber(openExceptions)}.`,
    highestDeposits
      ? `${rowLabel(highestDeposits.row)} holds the highest deposits at ${formatUnit(highestDeposits.value, 'TZS bn')}.`
      : 'No deposit values were returned.',
    highestNpl
      ? `${rowLabel(highestNpl.row)} has the highest NPL at ${formatPercent(highestNpl.value)}.`
      : 'No NPL values were returned.',
    lowestCar
      ? `${rowLabel(lowestCar.row)} has the lowest capital adequacy at ${formatPercent(lowestCar.value)}.`
      : 'No capital adequacy values were returned.',
  ].join(' ');

  const detail = `Tiers represented on this page: ${tierSummary || 'not available'}. Regions: ${[...regions].sort().join(', ') || 'not available'}.`;

  const facts: AssistantNarrative['facts'] = [
    { label: 'Matched institutions', value: formatNumber(total) },
    { label: 'On this page', value: formatNumber(items.length) },
    { label: 'Active', value: formatNumber(active) },
    { label: 'Monitoring', value: formatNumber(monitoring) },
    { label: 'Tier breakdown', value: tierSummary || 'not available' },
    { label: 'Open signals on page', value: formatNumber(openExceptions) },
    {
      label: 'Highest deposits',
      value: highestDeposits ? rowLabel(highestDeposits.row) : 'not available',
      detail: highestDeposits ? formatUnit(highestDeposits.value, 'TZS bn') : undefined,
    },
    {
      label: 'Highest NPL',
      value: highestNpl ? rowLabel(highestNpl.row) : 'not available',
      detail: highestNpl ? formatPercent(highestNpl.value) : undefined,
    },
    {
      label: 'Lowest capital adequacy',
      value: lowestCar ? rowLabel(lowestCar.row) : 'not available',
      detail: lowestCar ? formatPercent(lowestCar.value) : undefined,
    },
    { label: 'Regions', value: formatNumber(regions.size), detail: [...regions].sort().join(', ') || undefined },
  ];

  return {
    headline,
    summary: summaryText,
    detail,
    facts,
    followUps: [
      'Rank institutions by deposits',
      'Rank institutions by NPL ratio',
      'List critical open exceptions for the latest period',
    ],
  };
}

function narrateRanking(result: RecordValue): AssistantNarrative {
  const metricKey = stringValue(result.metric) ?? 'open_exceptions';
  const metric = RANK_METRIC_LABELS[metricKey] ?? labelize(metricKey);
  const order = stringValue(result.order) === 'asc' ? 'ascending' : 'descending';
  const items = records(result.items);
  const considered = numberValue(result.totalConsidered) ?? items.length;

  if (items.length === 0) {
    return {
      headline: `Ranking by ${metric}: no records returned`,
      summary: 'No synthetic institutions are available for ranking.',
      detail: 'Seed or widen the institution register, then rerun the ranking.',
      facts: [{ label: 'Institutions considered', value: formatNumber(considered) }],
      followUps: [
        'List synthetic institutions',
        'Summarize the portfolio overview',
        'List open exceptions',
      ],
    };
  }

  const valuedItems = items.filter((item) => numberValue(item.value) !== null);
  const highest = extreme(valuedItems, 'value', 'max');
  const lowest = extreme(valuedItems, 'value', 'min');
  const spread = highest && lowest ? highest.value - lowest.value : null;
  const average = mean(items.map((item) => numberValue(item.value)));
  const missing = items.length - valuedItems.length;
  const highestId = highest ? rowId(highest.row) : '';
  const lowestId = lowest ? rowId(lowest.row) : '';

  const headline = highest
    ? `Ranking by ${metric} (${order}): ${rowLabel(highest.row)} at ${formatNumber(highest.value)}`
    : `Ranking by ${metric} (${order}): no numeric values`;

  const summaryText = [
    `${formatNumber(considered)} institutions were considered and ${formatNumber(items.length)} are shown in ${order} order by ${metric}.`,
    highest ? `${rowLabel(highest.row)} has the highest value at ${formatNumber(highest.value)}` : 'No numeric values were returned',
    lowest ? `and ${rowLabel(lowest.row)} the lowest at ${formatNumber(lowest.value)}` : 'and no lowest value is available',
    `for a spread of ${formatNumber(spread)}.`,
    `The average across ${formatNumber(valuedItems.length)} non-null values is ${formatNumber(average)}; ${formatNumber(missing)} of ${formatNumber(items.length)} rows have no value.`,
  ].join(' ');

  const detail = valuedItems.length > 0
    ? `Ranked rows: ${items.slice(0, 10).map((item, index) => `${index + 1}. ${rowLabel(item)} = ${formatNumber(numberValue(item.value))}`).join('; ')}.`
    : 'None of the returned rows carries a numeric value for this metric.';

  const facts: AssistantNarrative['facts'] = [
    { label: 'Metric', value: metric },
    { label: 'Order', value: order },
    { label: 'Institutions considered', value: formatNumber(considered) },
    { label: 'Rows returned', value: formatNumber(items.length) },
    {
      label: 'Highest',
      value: highest ? rowLabel(highest.row) : 'not available',
      detail: highest ? formatNumber(highest.value) : undefined,
    },
    {
      label: 'Lowest',
      value: lowest ? rowLabel(lowest.row) : 'not available',
      detail: lowest ? formatNumber(lowest.value) : undefined,
    },
    { label: 'Spread', value: formatNumber(spread) },
    { label: 'Average (non-null)', value: formatNumber(average) },
    { label: 'Missing values', value: `${formatNumber(missing)} of ${formatNumber(items.length)} rows` },
  ];

  return {
    headline,
    summary: summaryText,
    detail,
    facts,
    followUps: [
      `Show the 12-period ${metric} trend`,
      highestId && lowestId
        ? `Compare ${highestId} with ${lowestId}`
        : 'Compare two institutions',
      `List critical open exceptions for the latest period`,
    ],
  };
}

function narrateComparison(result: RecordValue): AssistantNarrative {
  const institutions = records(result.institutions);

  if (institutions.length < 2) {
    return {
      headline: 'Comparison: insufficient institutions',
      summary: institutions.length === 1
        ? 'Only one institution was returned; a comparison needs at least two.'
        : 'No synthetic institutions were returned for comparison.',
      detail: 'Request between two and five institution identifiers.',
      facts: [{ label: 'Institutions returned', value: formatNumber(institutions.length) }],
      followUps: [
        'Compare TZ001 with TZ004',
        'Rank institutions by deposits',
        'List synthetic institutions',
      ],
    };
  }

  const metricDefinitions: Array<{ key: string; label: string; unit: string }> = [
    { key: 'depositsTzsBillions', label: 'Deposits', unit: 'TZS bn' },
    { key: 'capitalAdequacyRatioPercent', label: 'Capital adequacy', unit: '%' },
    { key: 'nplRatioPercent', label: 'NPL ratio', unit: '%' },
    { key: 'openExceptions', label: 'Open exceptions', unit: '' },
  ];

  const metricResults = metricDefinitions.map((definition) => {
    const highest = extreme(institutions, definition.key, 'max');
    const lowest = extreme(institutions, definition.key, 'min');
    return {
      ...definition,
      highest,
      lowest,
      difference: highest && lowest ? highest.value - lowest.value : null,
    };
  });

  const ldrResults = institutions.map((institution) => {
    const deposits = numberValue(institution.depositsTzsBillions);
    const loans = numberValue(institution.loansTzsBillions) ?? numberValue(institution.loans);
    const ldr = deposits !== null && deposits !== 0 && loans !== null ? (loans / deposits) * 100 : null;
    return { institution, ldr };
  });

  const depositMetric = metricResults.find((metric) => metric.key === 'depositsTzsBillions');
  const names = institutions.map((institution) => rowLabel(institution)).join(', ');
  const headline = depositMetric?.highest
    ? `Comparison: ${institutions.length} institutions, ${rowLabel(depositMetric.highest.row)} leads deposits at ${formatUnit(depositMetric.highest.value, 'TZS bn')}`
    : `Comparison: ${institutions.length} institutions`;

  const metricSentences = metricResults.map((metric) => {
    if (!metric.highest || !metric.lowest) return `${metric.label}: not available.`;
    return `${metric.label}: ${rowLabel(metric.highest.row)} highest at ${presentValue(metric.highest.value, metric.unit)}, ${rowLabel(metric.lowest.row)} lowest at ${presentValue(metric.lowest.value, metric.unit)}, difference ${presentValue(metric.difference, metric.unit)}.`;
  });

  const ldrSentence = `Loan-to-deposit ratios: ${ldrResults.map(({ institution, ldr }) => `${rowLabel(institution)} ${formatPercent(ldr)}`).join('; ')}.`;

  const summaryText = `Comparing ${names}. ${metricSentences.join(' ')} ${ldrSentence}`;

  const detail = metricResults
    .map((metric) => `${metric.label} spread ${presentValue(metric.difference, metric.unit)}`)
    .join('; ');

  const facts: AssistantNarrative['facts'] = [
    { label: 'Institutions', value: names },
    ...metricResults.map((metric) => ({
      label: `Highest ${metric.label.toLowerCase()}`,
      value: metric.highest ? rowLabel(metric.highest.row) : 'not available',
      detail: metric.highest && metric.lowest
        ? `${presentValue(metric.highest.value, metric.unit)} vs ${presentValue(metric.lowest.value, metric.unit)}; difference ${presentValue(metric.difference, metric.unit)}`
        : undefined,
    })),
    ...ldrResults.map(({ institution, ldr }) => ({
      label: `${rowLabel(institution)} LDR`,
      value: formatPercent(ldr),
    })),
  ];

  const firstId = rowId(institutions[0]);
  const secondId = rowId(institutions[1]);

  return {
    headline,
    summary: summaryText,
    detail,
    facts,
    followUps: [
      firstId && secondId ? `Compare ${firstId} with ${secondId} over 12 periods` : 'Compare two institutions over time',
      'Show the 12-period deposits trend',
      'Rank institutions by capital adequacy',
    ],
  };
}

interface SentenceCandidate {
  sourceIndex: number;
  position: number;
  sentence: string;
  score: number;
}

function queryTokens(query: string | null): string[] {
  if (!query) return [];
  return [...new Set(
    query
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 2 && !STOP_WORDS.has(token)),
  )];
}

function sentenceScore(sentence: string, tokens: string[]): number {
  const lower = sentence.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (lower.includes(token)) score += 3;
  }
  if (/[0-9]/.test(sentence)) score += 2;
  for (const term of DOMAIN_TERMS) {
    if (lower.includes(term)) score += 1;
  }
  return score;
}

function extractSentences(hits: RecordValue[], query: string | null): string[] {
  const tokens = queryTokens(query);
  const candidates: SentenceCandidate[] = [];
  hits.slice(0, 5).forEach((hit, sourceIndex) => {
    const excerpt = stringValue(hit.excerpt) ?? '';
    excerpt
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 20)
      .forEach((sentence, position) => {
        candidates.push({
          sourceIndex,
          position,
          sentence,
          score: sentenceScore(sentence, tokens),
        });
      });
  });

  const qualified = candidates.filter((candidate) => candidate.score > 0);
  const selected: SentenceCandidate[] = [];
  const usedSentences = new Set<string>();
  const bestBySource = new Map<number, SentenceCandidate>();
  for (const candidate of qualified) {
    const current = bestBySource.get(candidate.sourceIndex);
    if (!current || candidate.score > current.score) {
      bestBySource.set(candidate.sourceIndex, candidate);
    }
  }

  const ordered = [...bestBySource.values()].sort((left, right) =>
    right.score - left.score || left.sourceIndex - right.sourceIndex,
  );
  for (const candidate of ordered) {
    if (selected.length >= 4) break;
    if (usedSentences.has(candidate.sentence)) continue;
    usedSentences.add(candidate.sentence);
    selected.push(candidate);
  }

  if (selected.length < 3) {
    const remaining = qualified
      .filter((candidate) => !usedSentences.has(candidate.sentence))
      .sort((left, right) =>
        right.score - left.score ||
        left.sourceIndex - right.sourceIndex ||
        left.position - right.position,
      );
    for (const candidate of remaining) {
      if (selected.length >= 3) break;
      usedSentences.add(candidate.sentence);
      selected.push(candidate);
    }
  }

  if (selected.length === 0) {
    hits.slice(0, 5).forEach((hit, sourceIndex) => {
      if (selected.length >= 3) return;
      const excerpt = stringValue(hit.excerpt) ?? '';
      const firstSentence = excerpt.split(/(?<=[.!?])\s+/)[0]?.trim();
      if (firstSentence && !usedSentences.has(firstSentence)) {
        usedSentences.add(firstSentence);
        selected.push({ sourceIndex, position: 0, sentence: firstSentence, score: 0 });
      }
    });
  }

  return selected
    .sort((left, right) => left.sourceIndex - right.sourceIndex || left.position - right.position)
    .map((candidate) => `[S${candidate.sourceIndex + 1}] ${candidate.sentence}`);
}

function narrateSearch(result: RecordValue): AssistantNarrative {
  const hits = records(result.hits);
  const mode = stringValue(result.retrievalMode) ?? 'keyword';
  const modeLabel = mode === 'hybrid' ? 'hybrid retrieval' : 'keyword retrieval';
  const answer = asRecord(result.answer);
  const status = answer ? stringValue(answer.status) ?? 'no_evidence' : 'no_evidence';
  const answerText = answer ? stringValue(answer.text) : null;
  const citations = answer ? records(answer.citations).length : 0;
  const fallbackReason = stringValue(result.fallbackReason);
  const answerError = answer ? stringValue(answer.error) : null;
  const searchQuery = stringValue(result.query);

  const headline = status === 'answered'
    ? `Search: ${hits.length} sources via ${mode}; validated answer`
    : `Search: ${hits.length} sources via ${mode}; answer ${status === 'unavailable' ? 'unavailable' : 'not found in evidence'}`;

  const extractive = extractSentences(hits, searchQuery);
  const summaryText = status === 'answered' && answerText
    ? answerText
    : extractive.length > 0
      ? extractive.join(' ')
      : 'No synthetic evidence sources were retrieved.';

  const detailParts = [
    `Retrieved ${plural(hits.length, 'synthetic source')} with ${modeLabel}${fallbackReason ? ` (${fallbackReason})` : ''}.`,
  ];
  if (status === 'answered') {
    detailParts.push(`The validated answer cites ${plural(citations, 'source')}.`);
  } else if (status === 'unavailable') {
    detailParts.push('The local answer could not be validated, so the summary quotes the retrieved sources directly.');
  } else {
    detailParts.push('Retrieval found no evidence that directly answers the question.');
  }
  if (answerError) detailParts.push(`Local model note: ${answerError}.`);

  const facts: AssistantNarrative['facts'] = [
    { label: 'Retrieved sources', value: formatNumber(hits.length) },
    { label: 'Retrieval mode', value: mode },
    { label: 'Answer status', value: status },
    { label: 'Cited sources', value: formatNumber(citations) },
    ...hits.slice(0, 3).map((hit, index) => ({
      label: `Source S${index + 1}`,
      value: stringValue(hit.title) ?? stringValue(hit.id) ?? 'untitled source',
      detail: stringValue(hit.kind) ? labelize(stringValue(hit.kind) ?? 'source') : undefined,
    })),
  ];

  return {
    headline,
    summary: summaryText,
    detail: detailParts.join(' '),
    facts,
    followUps: [
      'List critical open exceptions for the latest period',
      'Show the 12-period deposits trend',
      'Explain the capital adequacy indicator',
    ],
  };
}

export function narrateToolResult(tool: string, result: unknown): AssistantNarrative {
  const record = asRecord(result) ?? {};
  switch (tool) {
    case 'get_portfolio_overview':
      return narrateOverview(record);
    case 'list_exceptions':
      return narrateExceptions(record);
    case 'get_institution':
      return narrateInstitution(record);
    case 'get_analytics':
      return narrateAnalytics(record);
    case 'list_institutions':
      return narrateInstitutions(record);
    case 'rank_institutions':
      return narrateRanking(record);
    case 'compare_institutions':
      return narrateComparison(record);
    case 'search_corpus':
      return narrateSearch(record);
    default:
      return {
        headline: `No narrative available for ${labelize(tool)}`,
        summary: 'This tool result has no narrative template; review the returned evidence directly.',
        detail: '',
        facts: [],
        followUps: [
          'Summarize the portfolio overview',
          'List open exceptions',
          'Explain synthetic institution TZ004',
        ],
      };
  }
}

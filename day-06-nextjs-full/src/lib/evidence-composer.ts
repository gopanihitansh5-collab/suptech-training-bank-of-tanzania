export interface EvidencePacket {
  question: string;
  rows: Array<Record<string, unknown>>;
  filters: Record<string, unknown>;
  citations: string[];
  rowCount: number;
}

function stableNumber(value: unknown): string[] {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return [String(value), value.toFixed(1), value.toFixed(2)];
  }
  if (typeof value === 'string' && /^[-+]?\d+(?:\.\d+)?$/.test(value.trim())) {
    const number = Number(value);
    if (Number.isFinite(number)) return [value.trim(), String(number), number.toFixed(1), number.toFixed(2)];
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}$/.test(value.trim())) {
    return [value.trim(), ...value.trim().split('-')];
  }
  return [];
}

export function buildEvidencePacket(
  question: string,
  rows: Array<Record<string, unknown>>,
  filters: Record<string, unknown> = {},
  citations: string[] = [],
): EvidencePacket {
  return {
    question: question.trim().slice(0, 500),
    rows: rows.slice(0, 500),
    filters,
    citations: [...new Set(citations)].slice(0, 100),
    rowCount: rows.length,
  };
}

function monthNumber(value: string): number | null {
  const names: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  };
  return names[value] ?? (/^(0?[1-9]|10|11|12)$/.test(value) ? Number(value) : null);
}

function requestedOperationMetric(question: string): {
  operation: 'average' | 'sum' | 'change' | 'maximum' | 'minimum' | 'latest' | 'count';
  field: string | null;
  label: string;
  suffix: string;
} | null {
  const normalized = question.toLowerCase();
  const operation = /\b(?:average|avg|mean)\b/.test(normalized) ? 'average'
    : /\b(?:sum|total|combined)\b/.test(normalized) ? 'sum'
      : /\b(?:change|difference|diff|increase|decrease|grew|growth)\b/.test(normalized) ? 'change'
        : /\b(?:highest|max|maximum|peak)\b/.test(normalized) ? 'maximum'
          : /\b(?:lowest|min|minimum)\b/.test(normalized) ? 'minimum'
            : /\b(?:latest|current|most recent)\b/.test(normalized) ? 'latest'
              : /\b(?:how many|count|number of)\b/.test(normalized) ? 'count'
                : null;
  if (!operation) return null;

  const fields: Array<[RegExp, string, string, string]> = [
    [/\b(?:capital|captical|car|capital adequacy|capital ratio)\b/, 'capitalAdequacy', 'capital adequacy', '%'],
    [/\b(?:npl|npl ratio|non[- ]performing)\b/, 'nplRatio', 'NPL ratio', '%'],
    [/\b(?:liquidity)\b/, 'liquidity', 'liquidity', '%'],
    [/\b(?:completeness|complete|completion)\b/, 'completeness', 'completeness', '%'],
    [/\b(?:deposits?|deposit)\b/, 'deposits', 'deposits', ' TZS bn'],
    [/\b(?:loans?|loan)\b/, 'loans', 'loans', ' TZS bn'],
  ];
  const match = fields.find(([pattern]) => pattern.test(normalized));
  return match
    ? { operation, field: match[1], label: match[2], suffix: match[3] }
    : { operation, field: null, label: 'row value', suffix: '' };
}

function computeRequestedOperation(packet: EvidencePacket): string | null {
  const requested = requestedOperationMetric(packet.question);
  if (!requested) return null;

  const normalizedQuestion = packet.question.toLowerCase();
  const year = normalizedQuestion.match(/\b(20\d{2})\b/)?.[1];
  const namedMonthMatch = [...normalizedQuestion.matchAll(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/g)]
    .map((match) => monthNumber(match[1]))
    .filter((value): value is number => value !== null);
  let startMonth: number | null = null;
  let endMonth: number | null = null;
  if (namedMonthMatch.length >= 2) {
    [startMonth, endMonth] = namedMonthMatch;
  } else {
    const numericRange = normalizedQuestion.match(/\b(0?[1-9]|10|11|12)\s*(?:to|through|thru|-|–|—)\s*(0?[1-9]|10|11|12)\b/);
    if (numericRange) {
      startMonth = Number(numericRange[1]);
      endMonth = Number(numericRange[2]);
    }
  }

  const rows = packet.rows.map((row) => {
    const period = String(row.period ?? row.reportingPeriod ?? row.periodId ?? '');
    const candidateFields = requested.field
      ? [
          requested.field,
          requested.field === 'capitalAdequacy' ? 'capital_adequacy' : requested.field,
          requested.field === 'nplRatio' ? 'npl_ratio' : requested.field,
          requested.field === 'deposits' ? 'depositsTzsBillions' : requested.field,
          requested.field === 'loans' ? 'loansTzsBillions' : requested.field,
        ]
      : [];
    let value: number | null = null;
    for (const field of candidateFields) {
      const raw = row[field];
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        value = raw;
        break;
      }
      if (typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw))) {
        value = Number(raw);
        break;
      }
    }
    return { period, value };
  }).filter((row) => {
    if (row.value === null) return false;
    if (!row.period) return true;
    if (year && row.period.startsWith(`${year}-`)) {
      if (startMonth !== null && endMonth !== null) {
        const month = Number(row.period.slice(5, 7));
        return month >= startMonth && month <= endMonth;
      }
    }
    return !year || row.period.startsWith(`${year}-`);
  });

  if (rows.length === 0) return null;
  rows.sort((left, right) => left.period.localeCompare(right.period));
  const values = rows.map((row) => row.value as number);

  if (requested.operation === 'count') {
    return `${rows.length} rows contain ${requested.label} values matching the returned evidence.`;
  }
  if (requested.operation === 'latest') {
    const latest = rows[rows.length - 1];
    return `The latest ${requested.label} is ${new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(latest.value as number)}${requested.suffix}${latest.period ? ` for ${latest.period}` : ''}.`;
  }
  if (requested.operation === 'maximum') {
    const highest = rows.reduce((best, row) => (row.value as number) > (best.value as number) ? row : best);
    return `The highest ${requested.label} is ${new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(highest.value as number)}${requested.suffix}${highest.period ? ` for ${highest.period}` : ''}.`;
  }
  if (requested.operation === 'minimum') {
    const lowest = rows.reduce((best, row) => (row.value as number) < (best.value as number) ? row : best);
    return `The lowest ${requested.label} is ${new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(lowest.value as number)}${requested.suffix}${lowest.period ? ` for ${lowest.period}` : ''}.`;
  }
  if (requested.operation === 'sum') {
    const total = values.reduce((sum, value) => sum + value, 0);
    return `The sum of ${requested.label} across ${rows.length} returned rows is ${new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(total)}${requested.suffix}.`;
  }
  if (requested.operation === 'change') {
    const first = rows[0];
    const latest = rows[rows.length - 1];
    const difference = (latest.value as number) - (first.value as number);
    const direction = difference > 0 ? 'increased' : difference < 0 ? 'decreased' : 'did not change';
    return `${requested.label} ${direction} from ${new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(first.value as number)}${requested.suffix}${first.period ? ` in ${first.period}` : ''} to ${new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(latest.value as number)}${requested.suffix}${latest.period ? ` in ${latest.period}` : ''}; change ${new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(difference)}${requested.suffix === '%' ? ' percentage points' : requested.suffix}.`;
  }
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return `The average ${requested.label} across ${rows.length} returned rows is ${new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(average)}${requested.suffix}.`;
}

export function composeDataSummary(packet: EvidencePacket): string {
  if (packet.rowCount === 0) {
    return 'No rows matched the returned query result for this exact request.';
  }

  const computed = computeRequestedOperation(packet);
  if (computed) return computed;

  if (packet.rowCount === 1) {
    const row = packet.rows[0];
    const values = Object.entries(row)
      .filter(([, value]) => value !== null && value !== undefined)
      .map(([key, value]) => `${key} ${String(value)}`)
      .slice(0, 8);
    return `One row was returned. ${values.join('; ')}.`;
  }

  const first = packet.rows[0];
  const fields = Object.keys(first).slice(0, 6);
  const preview = packet.rows.slice(0, 3).map((row, index) =>
    `row ${index + 1}: ${fields.map((field) => `${field}=${String(row[field] ?? '—')}`).join(', ')}`,
  );
  return `${packet.rowCount} rows were returned. ${preview.join('; ')}.`;
}

export function validateDraftAgainstEvidence(draft: string, packet: EvidencePacket): {
  valid: boolean;
  unsupportedNumbers: string[];
} {
  const evidenceNumbers = new Set<string>();
  for (const row of packet.rows) {
    for (const value of Object.values(row)) {
      stableNumber(value).forEach((number) => evidenceNumbers.add(number));
    }
  }
  for (const value of Object.values(packet.filters)) {
    stableNumber(value).forEach((number) => evidenceNumbers.add(number));
  }

  const draftNumbers = [...new Set(draft.match(/(?<![\w])[-+]?\d+(?:\.\d+)?(?![\w])/g) ?? [])];
  const unsupportedNumbers = draftNumbers.filter((number) => !evidenceNumbers.has(number));
  return { valid: unsupportedNumbers.length === 0, unsupportedNumbers };
}

export function composeValidatedSummary(packet: EvidencePacket, draft?: string): {
  text: string;
  validated: boolean;
  unsupportedNumbers: string[];
} {
  const fallback = composeDataSummary(packet);
  if (!draft) return { text: fallback, validated: true, unsupportedNumbers: [] };
  const validation = validateDraftAgainstEvidence(draft, packet);
  if (validation.valid) return { text: draft, validated: true, unsupportedNumbers: [] };
  return {
    text: fallback,
    validated: false,
    unsupportedNumbers: validation.unsupportedNumbers,
  };
}

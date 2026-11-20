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

export function composeDataSummary(packet: EvidencePacket): string {
  if (packet.rowCount === 0) {
    return 'No rows matched the returned query result for this exact request.';
  }

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

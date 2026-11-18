function escapeField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text =
    typeof value === 'boolean'
      ? value
        ? 'true'
        : 'false'
      : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(
  rows: Array<Record<string, unknown>>,
  columns: string[],
  labels?: Record<string, string>,
): string {
  if (columns.length === 0) return '';
  const header = columns.map((column) => escapeField(labels?.[column] ?? column));
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => escapeField(row[column])).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

export function csvResponse(filename: string, body: string): Response {
  const safeFilename = filename.replace(/[\r\n"]/g, '');
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${safeFilename}"`,
    },
  });
}

import { createHash } from 'node:crypto';
import { RequestValidationError } from './api-errors';

export const ACCEPTED_TYPES = {
  'text/plain': '.txt',
  'text/csv': '.csv',
  'application/json': '.json',
} as const;

export const MAX_BYTES = 2_000_000;

export interface ValidatedUpload {
  ok: true;
}

export interface ChunkOptions {
  size?: number;
  overlap?: number;
}

export interface BuiltChunks {
  chunks: string[];
  extractedCharacters: number;
}

function baseContentType(contentType: string): string {
  return contentType.split(';')[0]?.trim().toLowerCase() ?? '';
}

export function validateUpload(
  filename: string,
  contentType: string,
  byteSize: number,
): ValidatedUpload {
  const normalizedName = filename.trim().toLowerCase();
  const extension = normalizedName.slice(normalizedName.lastIndexOf('.'));
  const acceptedExtensions: string[] = Object.values(ACCEPTED_TYPES);
  if (!acceptedExtensions.includes(extension)) {
    throw new RequestValidationError(
      'Unsupported file extension. Only .txt, .csv, and .json files are accepted.',
    );
  }

  const normalizedType = baseContentType(contentType);
  if (!Object.prototype.hasOwnProperty.call(ACCEPTED_TYPES, normalizedType)) {
    throw new RequestValidationError(
      'Unsupported content type. Upload a text/plain, text/csv, or application/json file.',
    );
  }

  if (!Number.isFinite(byteSize) || byteSize < 0) {
    throw new RequestValidationError('The uploaded file size is invalid.');
  }
  if (byteSize === 0) {
    throw new RequestValidationError('The uploaded file is empty.');
  }
  if (byteSize > MAX_BYTES) {
    throw new RequestValidationError(
      'The uploaded file is too large. Maximum size is 2 MB.',
    );
  }

  return { ok: true };
}

export function parseJson(
  text: string,
): Record<string, unknown> | Array<unknown> {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new RequestValidationError('JSON content is empty.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    const raw = error instanceof Error ? error.message : 'Invalid JSON';
    throw new RequestValidationError(`JSON is malformed: ${raw}.`);
  }

  if (parsed === null || typeof parsed !== 'object') {
    throw new RequestValidationError(
      'JSON must contain a root object or array.',
    );
  }

  return parsed as Record<string, unknown> | Array<unknown>;
}

export function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let index = 0;

  while (index < text.length) {
    const character = text[index];

    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        const next = text[index];
        if (next !== undefined && next !== ',' && next !== '\n' && next !== '\r') {
          throw new RequestValidationError(
            'CSV is malformed: unexpected characters after a closing quote.',
          );
        }
        continue;
      }
      field += character;
      index += 1;
      continue;
    }

    if (character === '"') {
      if (field.length > 0) {
        throw new RequestValidationError(
          'CSV is malformed: a quote must start a field.',
        );
      }
      inQuotes = true;
      index += 1;
      continue;
    }

    if (character === ',') {
      row.push(field);
      field = '';
      index += 1;
      continue;
    }

    if (character === '\r' || character === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      index += character === '\r' && text[index + 1] === '\n' ? 2 : 1;
      continue;
    }

    field += character;
    index += 1;
  }

  if (inQuotes) {
    throw new RequestValidationError(
      'CSV is malformed: a quoted field is not closed.',
    );
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const size = options.size ?? 1200;
  const overlap = options.overlap ?? 100;

  if (!Number.isInteger(size) || size < 1) {
    throw new RequestValidationError('Chunk size must be a positive integer.');
  }
  if (!Number.isInteger(overlap) || overlap < 0 || overlap >= size) {
    throw new RequestValidationError(
      'Chunk overlap must be zero or greater and smaller than the chunk size.',
    );
  }

  if (text.trim().length === 0) return [];

  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + size, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) chunks.push(chunk);
    if (end >= text.length) break;
    start = end - overlap;
  }
  return chunks;
}

function looksLikeHeader(row: string[]): boolean {
  if (row.length === 0) return false;
  const seen = new Set<string>();
  let hasLetter = false;
  for (const cell of row) {
    const value = cell.trim();
    if (!value) return false;
    if (/^[-+]?\d+(?:\.\d+)?$/.test(value)) return false;
    if (/[a-z]/i.test(value)) hasLetter = true;
    const key = value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return hasLetter;
}

function csvChunk(row: string[], header: string[] | null): string {
  return row
    .map((value, column) => {
      const headerName = header?.[column]?.trim();
      const name = headerName && headerName.length > 0
        ? headerName
        : `column_${column + 1}`;
      return `${name}=${value.trim()}`;
    })
    .join('; ');
}

export function buildChunks(contentType: string, buffer: Buffer): BuiltChunks {
  const text = buffer.toString('utf8');
  const normalizedType = baseContentType(contentType);

  if (normalizedType === 'text/csv') {
    const rows = parseCsv(text);
    const hasHeader = rows.length > 1 && looksLikeHeader(rows[0]);
    const header = hasHeader ? rows[0] : null;
    const dataRows = hasHeader ? rows.slice(1) : rows;
    const chunks: string[] = [];
    for (const row of dataRows) {
      if (row.every((cell) => cell.trim().length === 0)) continue;
      const chunk = csvChunk(row, header);
      if (chunk.length > 0) chunks.push(chunk);
    }
    return {
      chunks,
      extractedCharacters: chunks.reduce((total, chunk) => total + chunk.length, 0),
    };
  }

  if (normalizedType === 'application/json') {
    const parsed = parseJson(text);
    if (Array.isArray(parsed)) {
      const chunks: string[] = [];
      for (const item of parsed) {
        const serialized =
          typeof item === 'object' && item !== null
            ? JSON.stringify(item)
            : String(item).trim();
        if (!serialized) continue;
        if (serialized.length > 1200) {
          chunks.push(...chunkText(serialized));
        } else {
          chunks.push(serialized);
        }
      }
      return {
        chunks,
        extractedCharacters: chunks.reduce(
          (total, chunk) => total + chunk.length,
          0,
        ),
      };
    }

    if (Object.keys(parsed).length === 0) {
      return { chunks: [], extractedCharacters: 0 };
    }

    const formatted = JSON.stringify(parsed, null, 2);
    const chunks = chunkText(formatted);
    return {
      chunks,
      extractedCharacters: formatted.length,
    };
  }

  return {
    chunks: chunkText(text),
    extractedCharacters: text.length,
  };
}

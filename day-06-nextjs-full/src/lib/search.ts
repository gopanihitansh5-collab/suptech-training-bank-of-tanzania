import { RequestValidationError } from './api-errors';
import { query } from './db';

export interface SearchCitation {
  documentId?: string;
  chunkIndex?: number;
  reportId?: string;
  institutionId?: string;
  period?: string;
  exceptionId?: string;
}

export type SearchKind = 'document' | 'report' | 'institution' | 'exception';

export interface SearchHit {
  kind: SearchKind;
  id: string;
  title: string;
  excerpt: string;
  citation: SearchCitation;
  rank: number;
}

export interface SearchOptions {
  limit?: number;
}

const MAX_LIMIT = 25;
const DEFAULT_DOCUMENT_LIMIT = 10;
const DEFAULT_STRUCTURED_LIMIT = 10;
const DEFAULT_MERGED_LIMIT = 8;
const MAX_MERGED_RESULTS = 20;
const QUERY_MIN_LENGTH = 2;
const QUERY_MAX_LENGTH = 200;
const EXCERPT_MAX_LENGTH = 300;

const KIND_ORDER: Record<SearchKind, number> = {
  document: 0,
  exception: 1,
  report: 2,
  institution: 3,
};

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export function containsPattern(value: string): string {
  return `%${escapeLike(value)}%`;
}

export function prefixPattern(value: string): string {
  return `${escapeLike(value)}%`;
}

export function truncateExcerpt(value: string, maxLength = EXCERPT_MAX_LENGTH): string {
  if (maxLength <= 0) return '';
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function boundedLimit(limit: number | undefined, fallback: number): number {
  if (limit === undefined || !Number.isFinite(limit)) return fallback;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

function hasLexeme(value: string): boolean {
  return /[\p{L}\p{N}]/u.test(value);
}

function validateQuery(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < QUERY_MIN_LENGTH || trimmed.length > QUERY_MAX_LENGTH) {
    throw new RequestValidationError(
      'Search query must be between 2 and 200 characters.',
    );
  }
  return trimmed;
}

function numeric(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function billions(value: unknown): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(1) : '—';
}

export async function searchDocuments(
  queryText: string,
  options: SearchOptions = {},
): Promise<SearchHit[]> {
  const search = queryText.trim();
  if (!search || !hasLexeme(search)) return [];
  const limit = boundedLimit(options.limit, DEFAULT_DOCUMENT_LIMIT);
  const result = await query(
    `SELECT c.document_id, c.chunk_index, c.content, d.original_filename,
       ts_rank_cd(c.content_search, websearch_to_tsquery('simple', $1)) AS search_rank
     FROM document_chunks c
     JOIN uploaded_documents d ON d.document_id = c.document_id
     WHERE d.status = 'completed'
       AND c.content_search @@ websearch_to_tsquery('simple', $1)
     ORDER BY search_rank DESC, d.original_filename, c.chunk_index
     LIMIT $2`,
    [search, limit],
  );

  return result.rows.map((row) => {
    const documentId = String(row.document_id);
    const chunkIndex = numeric(row.chunk_index);
    return {
      kind: 'document',
      id: `${documentId}:${chunkIndex}`,
      title: String(row.original_filename),
      excerpt: truncateExcerpt(String(row.content)),
      citation: { documentId, chunkIndex },
      rank: numeric(row.search_rank),
    };
  });
}

export async function searchReports(
  queryText: string,
  options: SearchOptions = {},
): Promise<SearchHit[]> {
  const search = queryText.trim();
  if (!search) return [];
  const limit = boundedLimit(options.limit, DEFAULT_STRUCTURED_LIMIT);
  const result = await query(
    `SELECT r.report_id, r.institution_id, i.institution_name, r.reporting_period,
       r.deposits_tzs_billions, r.loans_tzs_billions
     FROM institution_reports r
     JOIN institutions i USING (institution_id)
     WHERE i.institution_name ILIKE $1
        OR i.region ILIKE $1
        OR r.reporting_period ILIKE $2
     ORDER BY r.reporting_period DESC, i.institution_name
     LIMIT $3`,
    [containsPattern(search), prefixPattern(search), limit],
  );

  return result.rows.map((row) => {
    const reportId = String(row.report_id);
    const institutionId = String(row.institution_id);
    const period = String(row.reporting_period);
    return {
      kind: 'report',
      id: reportId,
      title: String(row.institution_name),
      excerpt: `${period} · ${row.institution_name} · deposits TZS ${billions(row.deposits_tzs_billions)}bn / loans TZS ${billions(row.loans_tzs_billions)}bn`,
      citation: { reportId, institutionId, period },
      rank: 0,
    };
  });
}

export async function searchInstitutions(
  queryText: string,
  options: SearchOptions = {},
): Promise<SearchHit[]> {
  const search = queryText.trim();
  if (!search) return [];
  const limit = boundedLimit(options.limit, DEFAULT_STRUCTURED_LIMIT);
  const result = await query(
    `SELECT i.institution_id, i.institution_name, i.institution_type, i.region
     FROM institutions i
     WHERE i.institution_name ILIKE $1
        OR i.region ILIKE $1
        OR i.institution_type ILIKE $1
     ORDER BY i.institution_name
     LIMIT $2`,
    [containsPattern(search), limit],
  );

  return result.rows.map((row) => {
    const institutionId = String(row.institution_id);
    return {
      kind: 'institution',
      id: institutionId,
      title: String(row.institution_name),
      excerpt: `${row.institution_type} · ${row.region} · ${institutionId}`,
      citation: { institutionId },
      rank: 0,
    };
  });
}

export async function searchExceptions(
  queryText: string,
  options: SearchOptions = {},
): Promise<SearchHit[]> {
  const search = queryText.trim();
  if (!search) return [];
  const limit = boundedLimit(options.limit, DEFAULT_STRUCTURED_LIMIT);
  const result = await query(
    `SELECT e.exception_id, e.report_id, e.institution_id,
       i.institution_name, e.reporting_period, e.indicator_id, e.severity,
       e.status, e.message, e.observed_value, e.threshold_value
     FROM supervisory_exceptions e
     JOIN institutions i USING (institution_id)
     WHERE e.exception_id ILIKE $1
        OR e.report_id ILIKE $1
        OR e.indicator_id ILIKE $1
        OR i.institution_name ILIKE $1
        OR e.message ILIKE $1
     ORDER BY e.reporting_period DESC,
       CASE e.severity
         WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3
       END
     LIMIT $2`,
    [containsPattern(search), limit],
  );

  return result.rows.map((row) => {
    const exceptionId = String(row.exception_id);
    const institutionId = String(row.institution_id);
    const period = String(row.reporting_period);
    return {
      kind: 'exception',
      id: exceptionId,
      title: `${row.severity} review signal · ${row.institution_name}`,
      excerpt: truncateExcerpt(
        `${row.message} Observed ${row.observed_value}; training threshold ${row.threshold_value}; status ${row.status}.`,
      ),
      citation: {
        exceptionId,
        reportId: String(row.report_id),
        institutionId,
        period,
      },
      rank: 0,
    };
  });
}

export async function searchAll(
  queryText: string,
  options: SearchOptions = {},
): Promise<SearchHit[]> {
  const search = validateQuery(queryText);
  const limit = boundedLimit(options.limit, DEFAULT_MERGED_LIMIT);
  const [documents, exceptions, reports, institutions] = await Promise.all([
    searchDocuments(search, { limit }),
    searchExceptions(search, { limit }),
    searchReports(search, { limit }),
    searchInstitutions(search, { limit }),
  ]);

  return [...documents, ...exceptions, ...reports, ...institutions]
    .sort(
      (left, right) =>
        right.rank - left.rank || KIND_ORDER[left.kind] - KIND_ORDER[right.kind],
    )
    .slice(0, MAX_MERGED_RESULTS);
}

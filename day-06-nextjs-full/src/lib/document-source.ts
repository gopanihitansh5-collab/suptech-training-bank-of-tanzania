import { NotFoundError, RequestValidationError } from './api-errors';
import { query } from './db';

const DOCUMENT_ID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const MAX_PREVIEW_CHARACTERS = 4000;

export interface DocumentChunkDetail {
  documentId: string;
  filename: string;
  contentType: string;
  byteSize: number;
  institutionId: string | null;
  institutionName: string | null;
  reportingPeriod: string | null;
  status: string;
  chunkIndex: number;
  content: string;
  contentTruncated: boolean;
  sourceReference: unknown;
}

export async function getDocumentChunkDetail(
  documentId: string,
  chunkIndex: number,
): Promise<DocumentChunkDetail> {
  if (!DOCUMENT_ID_PATTERN.test(documentId)) {
    throw new RequestValidationError('Document identifier is invalid.');
  }
  if (!Number.isSafeInteger(chunkIndex) || chunkIndex < 0) {
    throw new RequestValidationError('Document chunk index must be a non-negative integer.');
  }

  const result = await query<{
    document_id: string;
    original_filename: string;
    content_type: string;
    byte_size: string | number;
    institution_id: string | null;
    institution_name: string | null;
    reporting_period: string | null;
    status: string;
    chunk_index: number;
    content: string;
    source_reference: unknown;
  }>(
    `SELECT d.document_id, d.original_filename, d.content_type, d.byte_size,
       d.institution_id, i.institution_name, d.reporting_period, d.status,
       c.chunk_index, c.content, c.source_reference
     FROM uploaded_documents d
     JOIN document_chunks c ON c.document_id = d.document_id
     LEFT JOIN institutions i ON i.institution_id = d.institution_id
     WHERE d.document_id = $1::uuid
       AND c.chunk_index = $2
       AND d.status = 'completed'`,
    [documentId, chunkIndex],
  );
  const row = result.rows[0];
  if (!row) {
    throw new NotFoundError('The requested synthetic source chunk was not found.');
  }

  const content = String(row.content);
  return {
    documentId: String(row.document_id),
    filename: String(row.original_filename),
    contentType: String(row.content_type),
    byteSize: Number(row.byte_size),
    institutionId: row.institution_id,
    institutionName: row.institution_name,
    reportingPeriod: row.reporting_period,
    status: String(row.status),
    chunkIndex: Number(row.chunk_index),
    content: content.slice(0, MAX_PREVIEW_CHARACTERS),
    contentTruncated: content.length > MAX_PREVIEW_CHARACTERS,
    sourceReference: row.source_reference,
  };
}

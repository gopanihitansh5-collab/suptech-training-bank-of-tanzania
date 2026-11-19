import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { RequestValidationError } from './api-errors';
import { query, withTransaction } from './db';
import { buildChunks, sha256Hex, validateUpload } from './ingestion';

let storageClient: S3Client | undefined;

export function isS3Configured(): boolean {
  return Boolean(
    process.env.AWS_REGION?.trim() &&
    process.env.AWS_ENDPOINT_URL_S3?.trim() &&
    process.env.AWS_S3_BUCKET?.trim() &&
    process.env.AWS_ACCESS_KEY_ID?.trim() &&
    process.env.AWS_SECRET_ACCESS_KEY?.trim(),
  );
}

function getStorageBucket(): string {
  const bucket = process.env.AWS_S3_BUCKET?.trim();
  if (!bucket) {
    throw new RequestValidationError(
      'Object storage is not configured. Set AWS_S3_BUCKET.',
    );
  }
  return bucket;
}

export function resetStorageClient(): void {
  storageClient = undefined;
}

export function getStorageClient(): S3Client {
  const region = process.env.AWS_REGION;
  const endpoint = process.env.AWS_ENDPOINT_URL_S3;
  const bucket = process.env.AWS_S3_BUCKET?.trim();
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!region || !endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new RequestValidationError(
      'Object storage is not configured. Set AWS_REGION, AWS_ENDPOINT_URL_S3, AWS_S3_BUCKET, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.',
    );
  }

  if (!storageClient) {
    storageClient = new S3Client({
      region,
      endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return storageClient;
}

export function getLocalUploadsDir(): string {
  if (process.env.LOCAL_UPLOADS_DIR) {
    return path.resolve(process.env.LOCAL_UPLOADS_DIR);
  }
  const cwd = process.cwd();
  if (path.basename(cwd) === 'day-06-nextjs-full') {
    return path.resolve(cwd, '.local', 'uploads');
  }
  return path.resolve(cwd, 'day-06-nextjs-full', '.local', 'uploads');
}

export async function saveDocumentFile(
  storagePath: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  if (isS3Configured()) {
    await getStorageClient().send(
      new PutObjectCommand({
        Bucket: getStorageBucket(),
        Key: storagePath,
        Body: buffer,
        ContentType: contentType,
        ContentLength: buffer.length,
      }),
    );
  } else {
    if (process.env.VERCEL === '1') {
      throw new RequestValidationError(
        'Persistent S3-compatible object storage must be configured before uploading documents on Vercel.',
      );
    }
    const fullPath = path.join(/*turbopackIgnore: true*/ getLocalUploadsDir(), storagePath);
    await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.promises.writeFile(fullPath, buffer);
  }
}

export async function deleteDocumentFile(storagePath: string): Promise<void> {
  if (isS3Configured()) {
    await getStorageClient().send(
      new DeleteObjectCommand({
        Bucket: getStorageBucket(),
        Key: storagePath,
      }),
    );
    return;
  }
  if (process.env.VERCEL === '1') {
    throw new RequestValidationError(
      'Persistent S3-compatible object storage must be configured before deleting documents on Vercel.',
    );
  }
  try {
    const fullPath = path.join(/*turbopackIgnore: true*/ getLocalUploadsDir(), storagePath);
    if (fs.existsSync(/*turbopackIgnore: true*/ fullPath)) {
      await fs.promises.unlink(fullPath);
      const parentDir = path.dirname(fullPath);
      const remaining = await fs.promises.readdir(parentDir);
      if (remaining.length === 0) {
        await fs.promises.rmdir(parentDir);
      }
    }
  } catch {
    // Local deletion is best effort
  }
}

export interface IngestDocumentInput {
  filename: string;
  contentType: string;
  buffer: Buffer;
  uploadedBy: string;
  institutionId?: string | null;
  reportingPeriod?: string | null;
}

export interface IngestDocumentResult {
  documentId: string;
  status: 'completed';
  chunkCount: number;
}

export interface UploadedDocumentRow {
  documentId: string;
  originalFilename: string;
  contentType: string;
  byteSize: number;
  institutionId: string | null;
  institutionName: string | null;
  reportingPeriod: string | null;
  status: string;
  jobStatus: string | null;
  extractedCharacters: number;
  chunkCount: number;
  errorMessage: string | null;
  uploadedBy: string;
  createdAt: string;
}

export interface DocumentPage {
  items: UploadedDocumentRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface DocumentFilters {
  page?: number;
  pageSize?: number;
}

export interface IngestionJobRow {
  jobId: string;
  documentId: string;
  originalFilename: string;
  documentStatus: string;
  jobStatus: string;
  attemptCount: number;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  chunkCount: number;
}

export interface IngestionSummary {
  documentsByStatus: Record<string, number>;
  jobsByStatus: Record<string, number>;
}

const INGESTION_JOB_LIMIT_MIN = 1;
const INGESTION_JOB_LIMIT_MAX = 50;
const INGESTION_JOB_LIMIT_DEFAULT = 20;

function pagination(
  page = 1,
  pageSize = 20,
): { page: number; pageSize: number; offset: number } {
  if (!Number.isSafeInteger(page) || page < 1) {
    throw new RequestValidationError('Page must be a positive integer.');
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throw new RequestValidationError('Page size must be between 1 and 50.');
  }
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : 'Ingestion failed.';
  return raw.slice(0, 300);
}

async function recordAudit(
  actorId: string,
  action: string,
  documentId: string,
  details: Record<string, unknown>,
): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_events (actor_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, 'uploaded_document', $3, $4::jsonb)`,
      [actorId, action, documentId, JSON.stringify(details)],
    );
  } catch {
  }
}

async function insertChunks(
  documentId: string,
  chunks: string[],
): Promise<void> {
  const batchSize = 100;
  await withTransaction(async (client) => {
    for (let start = 0; start < chunks.length; start += batchSize) {
      const batch = chunks.slice(start, start + batchSize);
      const values: unknown[] = [];
      const valueLists = batch.map((content, offset) => {
        const chunkIndex = start + offset;
        const base = values.length;
        values.push(
          documentId,
          chunkIndex,
          content,
          JSON.stringify({ row: chunkIndex }),
        );
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::jsonb)`;
      });
      await client.query(
        `INSERT INTO document_chunks
           (document_id, chunk_index, content, source_reference)
         VALUES ${valueLists.join(', ')}`,
        values,
      );
    }
  });
}

export async function ingestDocument(
  input: IngestDocumentInput,
): Promise<IngestDocumentResult> {
  const { filename, contentType, buffer, uploadedBy } = input;
  validateUpload(filename, contentType, buffer.length);

  const checksum = sha256Hex(buffer);
  const existing = await query<{ document_id: string }>(
    `SELECT document_id FROM uploaded_documents
     WHERE checksum_sha256 = $1 LIMIT 1`,
    [checksum],
  );
  if (existing.rows.length > 0) {
    throw new RequestValidationError(
      'This file was already uploaded (duplicate checksum).',
    );
  }

  const documentId = randomUUID();
  const safeName = filename.replace(/[\\/]/g, '_');
  const storagePath = `documents/${documentId}/${safeName}`;

  await saveDocumentFile(storagePath, buffer, contentType);

  try {
    await query(
      `INSERT INTO uploaded_documents
         (document_id, original_filename, checksum_sha256, content_type,
          byte_size, storage_path, institution_id, reporting_period,
          status, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9)`,
      [
        documentId,
        filename,
        checksum,
        contentType,
        buffer.length,
        storagePath,
        input.institutionId ?? null,
        input.reportingPeriod ?? null,
        uploadedBy,
      ],
    );
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String(error.code)
        : '';
    if (code === '23505') {
      throw new RequestValidationError(
        'This file was already uploaded (duplicate checksum).',
      );
    }
    throw error;
  }

  await recordAudit(uploadedBy, 'document_uploaded', documentId, {
    filename,
    bytes: buffer.length,
    chunks: 0,
  });

  let jobId: string | null = null;
  let chunkCount = 0;

  try {
    const jobResult = await query<{ job_id: string }>(
      `INSERT INTO ingestion_jobs (document_id, status)
       VALUES ($1, 'queued')
       RETURNING job_id`,
      [documentId],
    );
    jobId = jobResult.rows[0].job_id;

    await query(
      `UPDATE ingestion_jobs
       SET status = 'processing', attempt_count = attempt_count + 1, started_at = now()
       WHERE job_id = $1`,
      [jobId],
    );
    await query(
      `UPDATE uploaded_documents
       SET status = 'processing', updated_at = now()
       WHERE document_id = $1`,
      [documentId],
    );

    const built = buildChunks(contentType, buffer);
    chunkCount = built.chunks.length;
    await insertChunks(documentId, built.chunks);

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE uploaded_documents
         SET status = 'completed', extracted_characters = $2,
           chunk_count = $3, error_message = NULL, updated_at = now()
         WHERE document_id = $1`,
        [documentId, built.extractedCharacters, built.chunks.length],
      );
      await client.query(
        `UPDATE ingestion_jobs
         SET status = 'completed', error_message = NULL, finished_at = now()
         WHERE job_id = $1`,
        [jobId],
      );
    });

    await recordAudit(uploadedBy, 'document_ingested', documentId, {
      filename,
      bytes: buffer.length,
      chunks: chunkCount,
    });

    return { documentId, status: 'completed', chunkCount };
  } catch (error) {
    const message = errorMessage(error);
    try {
      await query(
        `UPDATE uploaded_documents
         SET status = 'failed', error_message = $2, updated_at = now()
         WHERE document_id = $1`,
        [documentId, message],
      );
      if (jobId) {
        await query(
          `UPDATE ingestion_jobs
           SET status = 'failed', error_message = $2, finished_at = now()
           WHERE job_id = $1`,
          [jobId, message],
        );
      } else {
        await query(
          `UPDATE ingestion_jobs
           SET status = 'failed', error_message = $2, finished_at = now()
           WHERE document_id = $1`,
          [documentId, message],
        );
      }
    } catch {
    }
    await recordAudit(uploadedBy, 'document_failed', documentId, {
      filename,
      bytes: buffer.length,
      chunks: chunkCount,
      error: message,
    });
    throw error;
  }
}

const DOCUMENT_ID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export async function deleteDocument(
  documentId: string,
  actorId = 'system',
): Promise<boolean> {
  if (!DOCUMENT_ID_PATTERN.test(documentId)) {
    throw new RequestValidationError('Document identifier is invalid.');
  }

  const existing = await query<{ storage_path: string; original_filename: string }>(
    `SELECT storage_path, original_filename FROM uploaded_documents
     WHERE document_id = $1::uuid LIMIT 1`,
    [documentId],
  );
  if (existing.rows.length === 0) {
    return false;
  }
  const { storage_path: storagePath, original_filename: filename } = existing.rows[0];

  await deleteDocumentFile(storagePath);

  await query(
    `DELETE FROM uploaded_documents WHERE document_id = $1::uuid`,
    [documentId],
  );

  await recordAudit(actorId, 'document_deleted', documentId, {
    filename,
    storagePath,
  });

  return true;
}

function boundedJobLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return INGESTION_JOB_LIMIT_DEFAULT;
  }
  const truncated = Math.trunc(limit);
  return Math.min(Math.max(truncated, INGESTION_JOB_LIMIT_MIN), INGESTION_JOB_LIMIT_MAX);
}

export async function listIngestionJobs(
  limit = INGESTION_JOB_LIMIT_DEFAULT,
): Promise<IngestionJobRow[]> {
  const boundedLimit = boundedJobLimit(limit);
  const result = await query(
    `SELECT j.job_id, j.document_id, d.original_filename, d.status AS document_status,
       j.status AS job_status, j.attempt_count, j.error_message, j.started_at,
       j.finished_at, j.created_at, d.chunk_count
     FROM ingestion_jobs j
     JOIN uploaded_documents d ON d.document_id = j.document_id
     ORDER BY j.created_at DESC
     LIMIT $1`,
    [boundedLimit],
  );

  return result.rows.map((row) => ({
    jobId: row.job_id,
    documentId: row.document_id,
    originalFilename: row.original_filename,
    documentStatus: row.document_status,
    jobStatus: row.job_status,
    attemptCount: Number(row.attempt_count),
    errorMessage: row.error_message,
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    finishedAt: row.finished_at ? new Date(row.finished_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    chunkCount: Number(row.chunk_count),
  }));
}

export async function getIngestionSummary(): Promise<IngestionSummary> {
  const result = await query<{ kind: string; status: string; count: number }>(
    `SELECT 'document' AS kind, status, count(*)::int AS count
     FROM uploaded_documents
     GROUP BY status
     UNION ALL
     SELECT 'job' AS kind, status, count(*)::int AS count
     FROM ingestion_jobs
     GROUP BY status`,
  );

  const documentsByStatus: Record<string, number> = {};
  const jobsByStatus: Record<string, number> = {};
  for (const row of result.rows) {
    const target = row.kind === 'job' ? jobsByStatus : documentsByStatus;
    target[row.status] = Number(row.count);
  }
  return { documentsByStatus, jobsByStatus };
}

export async function listDocuments(
  filters: DocumentFilters = {},
): Promise<DocumentPage> {
  const { page, pageSize, offset } = pagination(filters.page, filters.pageSize);

  const countResult = await query<{ total: number }>(
    `SELECT count(*)::int AS total FROM uploaded_documents`,
  );
  const total = Number(countResult.rows[0]?.total ?? 0);

  const result = await query(
    `SELECT d.document_id, d.original_filename, d.content_type, d.byte_size,
       d.institution_id, i.institution_name, d.reporting_period, d.status,
       d.extracted_characters, d.chunk_count, d.error_message, d.uploaded_by,
       d.created_at, latest.status AS job_status
     FROM uploaded_documents d
     LEFT JOIN institutions i ON i.institution_id = d.institution_id
     LEFT JOIN LATERAL (
       SELECT status FROM ingestion_jobs j
       WHERE j.document_id = d.document_id
       ORDER BY j.created_at DESC
       LIMIT 1
     ) latest ON true
     ORDER BY d.created_at DESC
     LIMIT $1 OFFSET $2`,
    [pageSize, offset],
  );

  return {
    items: result.rows.map((row) => ({
      documentId: row.document_id,
      originalFilename: row.original_filename,
      contentType: row.content_type,
      byteSize: Number(row.byte_size),
      institutionId: row.institution_id,
      institutionName: row.institution_name,
      reportingPeriod: row.reporting_period,
      status: row.status,
      jobStatus: row.job_status,
      extractedCharacters: Number(row.extracted_characters),
      chunkCount: Number(row.chunk_count),
      errorMessage: row.error_message,
      uploadedBy: row.uploaded_by,
      createdAt: new Date(row.created_at).toISOString(),
    })),
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}

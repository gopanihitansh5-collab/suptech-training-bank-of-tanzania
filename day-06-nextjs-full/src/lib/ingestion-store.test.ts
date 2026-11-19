import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { RequestValidationError } from './api-errors';
import { query, withTransaction } from './db';
import {
  deleteDocument,
  deleteDocumentFile,
  getIngestionSummary,
  getLocalUploadsDir,
  getStorageClient,
  ingestDocument,
  isS3Configured,
  listDocuments,
  listIngestionJobs,
  resetStorageClient,
  saveDocumentFile,
} from './ingestion-store';

vi.mock('./db', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
}));

describe('ingestion-store module', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.mocked(query).mockReset();
    vi.mocked(withTransaction).mockReset();
    resetStorageClient();
    process.env = { ...originalEnv };
    delete process.env.AWS_REGION;
    delete process.env.AWS_ENDPOINT_URL_S3;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('dual storage configuration', () => {
    it('detects when S3 is unconfigured and reports false', () => {
      expect(isS3Configured()).toBe(false);
      expect(() => getStorageClient()).toThrow(RequestValidationError);
    });

    it('detects when S3 is configured and reports true', () => {
      process.env.AWS_REGION = 'us-east-1';
      process.env.AWS_ENDPOINT_URL_S3 = 'http://localhost:9000';
      process.env.AWS_ACCESS_KEY_ID = 'test-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';

      expect(isS3Configured()).toBe(true);
      const client = getStorageClient();
      expect(client).toBeDefined();
    });

    it('resolves local uploads directory properly', () => {
      const dir = getLocalUploadsDir();
      expect(dir).toContain('.local');
      expect(dir).toContain('uploads');
    });

    it('saves and deletes files on the local filesystem when S3 is not configured', async () => {
      const testStoragePath = 'test-docs/sample.txt';
      const buffer = Buffer.from('Local storage test content');
      await saveDocumentFile(testStoragePath, buffer, 'text/plain');

      const expectedFullPath = path.join(getLocalUploadsDir(), testStoragePath);
      expect(fs.existsSync(expectedFullPath)).toBe(true);
      expect(fs.readFileSync(expectedFullPath, 'utf8')).toBe('Local storage test content');

      await deleteDocumentFile(testStoragePath);
      expect(fs.existsSync(expectedFullPath)).toBe(false);
    });
  });

  describe('ingestDocument', () => {
    it('rejects duplicate checksums', async () => {
      vi.mocked(query).mockResolvedValueOnce({
        rows: [{ document_id: 'existing-id' }],
      } as never);

      await expect(
        ingestDocument({
          filename: 'test.txt',
          contentType: 'text/plain',
          buffer: Buffer.from('hello world'),
          uploadedBy: 'user-001',
        }),
      ).rejects.toThrow('This file was already uploaded (duplicate checksum).');
    });

    it('successfully ingests a document and saves to local storage', async () => {
      // 1. Check duplicate query -> empty
      vi.mocked(query).mockResolvedValueOnce({ rows: [] } as never);
      // 2. Insert uploaded_documents
      vi.mocked(query).mockResolvedValueOnce({ rows: [] } as never);
      // 3. Record audit
      vi.mocked(query).mockResolvedValueOnce({ rows: [] } as never);
      // 4. Insert ingestion_jobs
      vi.mocked(query).mockResolvedValueOnce({
        rows: [{ job_id: 'job-123' }],
      } as never);
      // 5. Update ingestion_jobs to processing
      vi.mocked(query).mockResolvedValueOnce({ rows: [] } as never);
      // 6. Update uploaded_documents to processing
      vi.mocked(query).mockResolvedValueOnce({ rows: [] } as never);

      // withTransaction for chunks and completing updates
      vi.mocked(withTransaction).mockImplementation(async (callback) => {
        const mockClient = { query: vi.fn().mockResolvedValue({ rows: [] }) };
        return callback(mockClient as never);
      });

      // Audit completed
      vi.mocked(query).mockResolvedValueOnce({ rows: [] } as never);

      const result = await ingestDocument({
        filename: 'rules.json',
        contentType: 'application/json',
        buffer: Buffer.from(JSON.stringify([{ rule: 'liquidity_ratio', min: 20 }])),
        uploadedBy: 'user-001',
      });

      expect(result.status).toBe('completed');
      expect(result.chunkCount).toBe(1);
      expect(result.documentId).toBeDefined();

      // Cleanup local test file
      await deleteDocumentFile(`documents/${result.documentId}/rules.json`);
    });
  });

  describe('deleteDocument', () => {
    it('rejects invalid documentId format', async () => {
      await expect(deleteDocument('invalid-id')).rejects.toThrow(
        'Document identifier is invalid.',
      );
    });

    it('returns false when document does not exist', async () => {
      vi.mocked(query).mockResolvedValueOnce({ rows: [] } as never);
      const result = await deleteDocument('c3b0f660-2f2c-4a57-922f-34aac67681d8');
      expect(result).toBe(false);
    });

    it('deletes document record and stored file when found', async () => {
      const docId = 'c3b0f660-2f2c-4a57-922f-34aac67681d8';
      const storagePath = `documents/${docId}/file.txt`;

      // Save a local file first
      await saveDocumentFile(storagePath, Buffer.from('data'), 'text/plain');

      // 1. SELECT query
      vi.mocked(query).mockResolvedValueOnce({
        rows: [{ storage_path: storagePath, original_filename: 'file.txt' }],
      } as never);
      // 2. DELETE query
      vi.mocked(query).mockResolvedValueOnce({ rows: [] } as never);
      // 3. Audit query
      vi.mocked(query).mockResolvedValueOnce({ rows: [] } as never);

      const deleted = await deleteDocument(docId, 'admin-user');
      expect(deleted).toBe(true);

      const fullPath = path.join(getLocalUploadsDir(), storagePath);
      expect(fs.existsSync(fullPath)).toBe(false);
    });
  });

  describe('listIngestionJobs', () => {
    it('clamps the limit to the 1..50 range', async () => {
      vi.mocked(query).mockResolvedValue({ rows: [] } as never);

      await listIngestionJobs(0);
      expect(vi.mocked(query).mock.calls[0][1]).toEqual([1]);

      await listIngestionJobs(999);
      expect(vi.mocked(query).mock.calls[1][1]).toEqual([50]);

      await listIngestionJobs();
      expect(vi.mocked(query).mock.calls[2][1]).toEqual([20]);

      await listIngestionJobs(Number.NaN);
      expect(vi.mocked(query).mock.calls[3][1]).toEqual([20]);
    });

    it('maps job rows joined to uploaded documents', async () => {
      const documentId = 'c3b0f660-2f2c-4a57-922f-34aac67681d8';
      vi.mocked(query).mockResolvedValueOnce({
        rows: [
          {
            job_id: 'job-123',
            document_id: documentId,
            original_filename: 'notes.json',
            document_status: 'completed',
            job_status: 'completed',
            attempt_count: 1,
            error_message: null,
            started_at: new Date('2026-10-15T10:00:00Z'),
            finished_at: new Date('2026-10-15T10:00:05Z'),
            created_at: new Date('2026-10-15T09:59:59Z'),
            chunk_count: 4,
          },
        ],
      } as never);

      const jobs = await listIngestionJobs(10);
      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toEqual({
        jobId: 'job-123',
        documentId,
        originalFilename: 'notes.json',
        documentStatus: 'completed',
        jobStatus: 'completed',
        attemptCount: 1,
        errorMessage: null,
        startedAt: '2026-10-15T10:00:00.000Z',
        finishedAt: '2026-10-15T10:00:05.000Z',
        createdAt: '2026-10-15T09:59:59.000Z',
        chunkCount: 4,
      });
    });

    it('maps a failed job with nullable timestamps and an error message', async () => {
      vi.mocked(query).mockResolvedValueOnce({
        rows: [
          {
            job_id: 'job-456',
            document_id: 'd3b0f660-2f2c-4a57-922f-34aac67681d8',
            original_filename: 'broken.csv',
            document_status: 'failed',
            job_status: 'failed',
            attempt_count: 2,
            error_message: 'Unsupported file',
            started_at: null,
            finished_at: null,
            created_at: new Date('2026-10-16T08:00:00Z'),
            chunk_count: 0,
          },
        ],
      } as never);

      const jobs = await listIngestionJobs(10);
      expect(jobs[0]).toMatchObject({
        jobStatus: 'failed',
        attemptCount: 2,
        errorMessage: 'Unsupported file',
        startedAt: null,
        finishedAt: null,
        chunkCount: 0,
      });
    });
  });

  describe('getIngestionSummary', () => {
    it('groups document and job counts by status', async () => {
      vi.mocked(query).mockResolvedValueOnce({
        rows: [
          { kind: 'document', status: 'completed', count: 3 },
          { kind: 'document', status: 'failed', count: 1 },
          { kind: 'job', status: 'completed', count: 3 },
          { kind: 'job', status: 'queued', count: 2 },
        ],
      } as never);

      const summary = await getIngestionSummary();
      expect(summary).toEqual({
        documentsByStatus: { completed: 3, failed: 1 },
        jobsByStatus: { completed: 3, queued: 2 },
      });
    });
  });

  describe('listDocuments', () => {
    it('validates pagination bounds', async () => {
      await expect(listDocuments({ page: 0 })).rejects.toThrow(
        'Page must be a positive integer.',
      );
      await expect(listDocuments({ pageSize: 51 })).rejects.toThrow(
        'Page size must be between 1 and 50.',
      );
    });

    it('returns document page matching API contract', async () => {
      vi.mocked(query)
        .mockResolvedValueOnce({ rows: [{ total: 1 }] } as never)
        .mockResolvedValueOnce({
          rows: [
            {
              document_id: 'c3b0f660-2f2c-4a57-922f-34aac67681d8',
              original_filename: 'notes.json',
              content_type: 'application/json',
              byte_size: 1024,
              institution_id: 'TZ001',
              institution_name: 'CRDB Bank',
              reporting_period: '2026-10',
              status: 'completed',
              extracted_characters: 500,
              chunk_count: 2,
              error_message: null,
              uploaded_by: 'supervisor-1',
              created_at: new Date('2026-10-15T10:00:00Z').toISOString(),
              job_status: 'completed',
            },
          ],
        } as never);

      const result = await listDocuments({ page: 1, pageSize: 10 });
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        documentId: 'c3b0f660-2f2c-4a57-922f-34aac67681d8',
        originalFilename: 'notes.json',
        contentType: 'application/json',
        byteSize: 1024,
        chunkCount: 2,
        status: 'completed',
        uploadedBy: 'supervisor-1',
      });
    });
  });
});

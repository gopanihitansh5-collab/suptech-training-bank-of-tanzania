import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestValidationError } from './api-errors';
import { query } from './db';
import { getDocumentChunkDetail } from './document-source';

vi.mock('./db', () => ({ query: vi.fn() }));

const documentId = 'c3b0f660-2f2c-4a57-922f-34aac67681d8';

describe('document source lookup', () => {
  beforeEach(() => vi.mocked(query).mockReset());

  it('rejects invalid identifiers and chunk indexes before querying', async () => {
    await expect(getDocumentChunkDetail('not-a-uuid', 0))
      .rejects.toBeInstanceOf(RequestValidationError);
    await expect(getDocumentChunkDetail(documentId, -1))
      .rejects.toBeInstanceOf(RequestValidationError);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns a bounded source excerpt with its citation metadata', async () => {
    vi.mocked(query).mockResolvedValueOnce({
      rows: [{
        document_id: documentId,
        original_filename: 'synthetic.csv',
        content_type: 'text/csv',
        byte_size: '5000',
        institution_id: 'TZ004',
        institution_name: 'Synthetic Bank 4',
        reporting_period: '2026-10',
        status: 'completed',
        chunk_index: 2,
        content: 'x'.repeat(5000),
        source_reference: { row: 3 },
      }],
    } as never);

    const detail = await getDocumentChunkDetail(documentId, 2);

    expect(detail.content).toHaveLength(4000);
    expect(detail.contentTruncated).toBe(true);
    expect(detail).toMatchObject({
      documentId,
      filename: 'synthetic.csv',
      byteSize: 5000,
      chunkIndex: 2,
      sourceReference: { row: 3 },
    });
    expect(vi.mocked(query).mock.calls[0][1]).toEqual([documentId, 2]);
  });
});

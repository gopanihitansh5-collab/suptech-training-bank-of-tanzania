import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthError, requireDemoSession } from '../../../lib/auth';
import {
  ingestReportCsv,
  listReportImportBatches,
  previewReportImport,
} from '../../../lib/report-import-store';
import { GET, POST } from './route';

vi.mock('../../../lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/auth')>();
  return { ...actual, requireDemoSession: vi.fn() };
});
vi.mock('../../../lib/report-import-store', () => ({
  ingestReportCsv: vi.fn(),
  listReportImportBatches: vi.fn(),
  previewReportImport: vi.fn(),
}));

function request(formData: FormData): Request {
  return new Request('https://demo.example.com/api/report-imports', {
    method: 'POST',
    headers: { origin: 'https://demo.example.com' },
    body: formData,
  });
}

function form(mode: string, file?: File): FormData {
  const formData = new FormData();
  formData.set('mode', mode);
  formData.set('syntheticOnlyConfirmed', 'true');
  if (file) formData.set('file', file);
  return formData;
}

describe('/api/report-imports', () => {
  beforeEach(() => {
    vi.mocked(requireDemoSession).mockResolvedValue({
      userId: 'demo.supervisor',
      role: 'supervisor',
      expiresAt: Date.now() + 60_000,
    });
    vi.mocked(previewReportImport).mockResolvedValue({
      columns: ['institution_id'],
      mapping: {},
      suggestedMapping: {},
      missingFields: ['institutionId'],
      totalRows: 1,
      acceptedRows: 0,
      rejectedRows: 1,
      additionalColumns: ['institution_id'],
      rows: [],
    });
    vi.mocked(listReportImportBatches).mockResolvedValue([]);
    vi.mocked(ingestReportCsv).mockResolvedValue({
      batch: {
        batchId: 'batch-1',
        filename: 'reports.csv',
        uploadedBy: 'demo.supervisor',
        status: 'completed',
        totalRows: 1,
        acceptedRows: 1,
        rejectedRows: 0,
        columns: [],
        mapping: {},
        checksum: 'a'.repeat(64),
        createdAt: new Date().toISOString(),
      },
      rows: [],
    });
  });

  afterEach(() => vi.clearAllMocks());

  it('requires a supervisor or admin session', async () => {
    vi.mocked(requireDemoSession).mockRejectedValueOnce(new AuthError(401, 'Sign in.'));

    const response = await POST(request(form('preview', new File(['x'], 'reports.csv'))));

    expect(response.status).toBe(401);
    expect(vi.mocked(previewReportImport)).not.toHaveBeenCalled();
  });

  it('rejects viewers and unconfirmed non-synthetic files', async () => {
    vi.mocked(requireDemoSession).mockResolvedValueOnce({
      userId: 'demo.viewer',
      role: 'viewer',
      expiresAt: Date.now() + 60_000,
    });
    const viewerResponse = await POST(
      request(form('preview', new File(['x'], 'reports.csv'))),
    );
    expect(viewerResponse.status).toBe(403);

    const unconfirmed = form('preview', new File(['x'], 'reports.csv'));
    unconfirmed.delete('syntheticOnlyConfirmed');
    const confirmationResponse = await POST(request(unconfirmed));
    expect(confirmationResponse.status).toBe(400);
    expect(vi.mocked(previewReportImport)).not.toHaveBeenCalled();
  });

  it('previews mapped rows without importing them', async () => {
    const response = await POST(request(form('preview', new File(['csv'], 'reports.csv'))));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.preview.totalRows).toBe(1);
    expect(vi.mocked(previewReportImport)).toHaveBeenCalledWith(
      Buffer.from('csv'),
      undefined,
    );
    expect(vi.mocked(ingestReportCsv)).not.toHaveBeenCalled();
  });

  it('commits with the selected mapping and uploader identity', async () => {
    const data = form('commit', new File(['csv'], 'reports.csv'));
    data.set('mapping', JSON.stringify({ institutionId: 'Entity Code' }));

    const response = await POST(request(data));

    expect(response.status).toBe(201);
    expect(vi.mocked(ingestReportCsv)).toHaveBeenCalledWith({
      buffer: Buffer.from('csv'),
      filename: 'reports.csv',
      mapping: { institutionId: 'Entity Code' },
      uploadedBy: 'demo.supervisor',
    });
  });

  it('lists recent import batches for signed-in users', async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ batches: [] });
    expect(vi.mocked(listReportImportBatches)).toHaveBeenCalledOnce();
  });
});

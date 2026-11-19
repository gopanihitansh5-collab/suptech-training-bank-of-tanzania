import type { PoolClient } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withTransaction } from './db';
import { ingestReportCsv } from './report-import-store';

vi.mock('./db', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
}));

const csv = [
  'institution_id,reporting_period,deposits_tzs_billions,loans_tzs_billions,capital_adequacy_ratio_percent,liquidity_ratio_percent,npl_ratio_percent,report_completeness_percent,late_submission_days,records_submitted,records_rejected,source_record_id,review_note',
  'TZ002,2026-11,125.5,84.3,16.2,112,3.2,98,0,400,2,SRC-002,training note',
  'UNKNOWN,2026-11,100,80,15,100,3,95,0,300,0,SRC-003,training note',
].join('\n');

describe('report import persistence', () => {
  let existingReports: Array<{ institution_id: string; reporting_period: string }>;
  let clientQuery: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    existingReports = [];
    clientQuery = vi.fn(async (sql: string, values: unknown[] = []) => {
      if (sql.includes('SELECT pg_advisory_xact_lock')) return { rows: [] };
      if (sql === 'SELECT institution_id FROM institutions') {
        return { rows: [{ institution_id: 'TZ002' }] };
      }
      if (sql === 'SELECT institution_id, reporting_period FROM institution_reports') {
        return { rows: existingReports };
      }
      if (sql.includes('INSERT INTO institution_reports')) {
        return { rows: [{ report_id: values[0] }] };
      }
      if (sql.includes('SELECT institution_id, institution_name')) {
        return {
          rows: [{
            institution_id: 'TZ002',
            institution_name: 'Kivukoni Community Bank',
            institution_type: 'Commercial Bank',
            region: 'Mwanza',
            tier: 'Tier 2',
            status: 'active',
          }],
        };
      }
      if (sql.includes('SELECT report_id, institution_id')) {
        return {
          rows: [{
            report_id: 'imported-report',
            institution_id: 'TZ002',
            reporting_period: '2026-11',
            deposits_tzs_billions: 125.5,
            loans_tzs_billions: 84.3,
            capital_adequacy_ratio_percent: 16.2,
            liquidity_ratio_percent: 112,
            npl_ratio_percent: 3.2,
            report_completeness_percent: 98,
            late_submission_days: 0,
            records_submitted: 400,
            records_rejected: 2,
            source_record_ids: ['SRC-002'],
            submitted_at: new Date('2026-11-18T00:00:00Z'),
          }],
        };
      }
      return { rows: [] };
    });

    vi.mocked(withTransaction).mockImplementation(async (operation) =>
      operation({ query: clientQuery } as unknown as PoolClient),
    );
  });

  it('imports valid rows, rejects invalid ones and retains accepted row metadata', async () => {
    const result = await ingestReportCsv({
      buffer: Buffer.from(csv),
      filename: 'reports.csv',
      uploadedBy: 'demo.supervisor',
    });

    expect(result.batch).toMatchObject({
      status: 'completed_with_errors',
      totalRows: 2,
      acceptedRows: 1,
      rejectedRows: 1,
    });
    expect(result.rows.map((row) => row.status)).toEqual(['accepted', 'rejected']);
    expect(result.rows[1].errors[0]).toContain('does not exist');
    const reportInsert = clientQuery.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO institution_reports'),
    );
    expect(reportInsert).toBeDefined();
    const rowInsert = clientQuery.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO report_import_rows'),
    );
    expect(rowInsert?.[1]).toContain(JSON.stringify({ review_note: 'training note' }));
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO supervisory_indicators'),
      expect.any(Array),
    );
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_events'),
      expect.any(Array),
    );
  });

  it('does not overwrite an existing institution and period report', async () => {
    existingReports = [{ institution_id: 'TZ002', reporting_period: '2026-11' }];

    const result = await ingestReportCsv({
      buffer: Buffer.from(csv.split('\n').slice(0, 2).join('\n')),
      filename: 'duplicate.csv',
      uploadedBy: 'demo.supervisor',
    });

    expect(result.batch).toMatchObject({
      status: 'rejected',
      acceptedRows: 0,
      rejectedRows: 1,
    });
    expect(result.rows[0].errors).toContain(
      'A report already exists for this institution and period.',
    );
    expect(clientQuery.mock.calls.some(([sql]) =>
      String(sql).includes('INSERT INTO institution_reports'),
    )).toBe(false);
  });
});

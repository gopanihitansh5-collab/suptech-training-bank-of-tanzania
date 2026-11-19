import { describe, expect, it } from 'vitest';
import {
  parseReportImportCsv,
  validateReportImportRows,
  type ReportImportReferenceData,
} from './report-import';

const reference: ReportImportReferenceData = {
  institutionIds: new Set(['TZ001', 'TZ002']),
  existingReports: new Set(['TZ001\u00002026-10']),
};

const header = [
  'Institution Code',
  'Month',
  'Total Deposits',
  'Total Loans',
  'CAR %',
  'LCR %',
  'NPL %',
  'Completeness %',
  'Late Days',
  'Submitted Records',
  'Rejected Records',
  'Source ID',
  'Supervisor Note',
].join(',');

function csvRow(
  institution = 'TZ002',
  period = '2026-11',
  sourceId = 'SRC-002',
  extra = 'synthetic note',
): string {
  return [
    institution,
    period,
    '125.5',
    '84.3',
    '16.2',
    '112',
    '3.2',
    '98',
    '0',
    '400',
    '2',
    sourceId,
    extra,
  ].join(',');
}

describe('report CSV import parsing', () => {
  it('auto-maps common header variants and retains unknown columns as metadata', () => {
    const parsed = parseReportImportCsv(Buffer.from(`\uFEFF${header}\n${csvRow()}`));
    const result = validateReportImportRows(parsed, reference);

    expect(result.acceptedRows).toBe(1);
    expect(result.rows[0]).toMatchObject({
      rowNumber: 2,
      institutionId: 'TZ002',
      period: '2026-11',
      sourceRecordId: 'SRC-002',
      status: 'ready',
      additionalFieldCount: 1,
    });
    expect(result.additionalColumns).toEqual(['Supervisor Note']);
    expect(parsed.rows[0].values).toMatchObject({
      depositsTzsBillions: 125.5,
      recordsRejected: 2,
    });
    expect(parsed.rows[0].additionalFields).toEqual({ 'Supervisor Note': 'synthetic note' });
  });

  it('allows manual mapping when automatic header detection is incomplete', () => {
    const columns = header.replace('Institution Code', 'Bank Key').split(',');
    const mapping = parseReportImportCsv(
      Buffer.from(`${columns.join(',')}\n${csvRow()}`),
      { institutionId: 'Bank Key' },
    );
    const preview = validateReportImportRows(mapping, reference);

    expect(preview.missingFields).toEqual([]);
    expect(preview.acceptedRows).toBe(1);
  });

  it('rejects unknown institutions, existing reports, and duplicate rows but keeps valid rows', () => {
    const parsed = parseReportImportCsv(Buffer.from([
      header,
      csvRow('TZ001', '2026-10', 'EXISTING'),
      csvRow('TZ999', '2026-11', 'UNKNOWN'),
      csvRow('TZ002', '2026-11', 'FIRST'),
      csvRow('TZ002', '2026-11', 'DUPLICATE'),
    ].join('\n')));
    const preview = validateReportImportRows(parsed, reference);

    expect(preview.acceptedRows).toBe(1);
    expect(preview.rejectedRows).toBe(3);
    expect(preview.rows[0].errors).toContain(
      'A report already exists for this institution and period.',
    );
    expect(preview.rows[1].errors[0]).toContain('does not exist');
    expect(preview.rows[3].errors).toContain(
      'This institution and period appears more than once in the CSV.',
    );
  });

  it('rejects invalid metric values with row-specific reasons', () => {
    const invalidRow = csvRow().replace(',84.3,', ',-1,');
    const preview = validateReportImportRows(
      parseReportImportCsv(Buffer.from(`${header}\n${invalidRow}`)),
      reference,
    );

    expect(preview.acceptedRows).toBe(0);
    expect(preview.rows[0].errors).toContain('Loans is outside the supported range.');
  });

  it('rejects duplicate headers, malformed CSV and row counts above the limit', () => {
    expect(() => parseReportImportCsv(Buffer.from('Institution ID,institution_id\nTZ001,TZ001')))
      .toThrow('CSV headers must be unique.');
    expect(() => parseReportImportCsv(Buffer.from('"unterminated')))
      .toThrow('CSV could not be parsed.');
    expect(() => parseReportImportCsv(Buffer.from(`${header}\n${Array(501).fill(csvRow()).join('\n')}`)))
      .toThrow('at most 500 data rows');
  });
});

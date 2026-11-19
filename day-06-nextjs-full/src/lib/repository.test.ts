import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QueryResult, QueryResultRow } from 'pg';
import { NotFoundError, RequestValidationError } from './api-errors';
import { query } from './db';
import {
  getAnalytics,
  getDataExplorerStats,
  getExceptionById,
  listExceptions,
  listReports,
  updateExceptionStatus,
} from './repository';

vi.mock('./db', () => ({ query: vi.fn() }));

describe('repository input validation', () => {
  beforeEach(() => vi.mocked(query).mockReset());

  it('rejects unknown indicators before querying the database', async () => {
    await expect(getAnalytics(undefined, 'unlisted_indicator'))
      .rejects.toBeInstanceOf(RequestValidationError);
    await expect(getAnalytics('2026-13'))
      .rejects.toBeInstanceOf(RequestValidationError);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects invalid exception severity and pagination before querying', async () => {
    await expect(listExceptions({ severity: 'urgent' }))
      .rejects.toBeInstanceOf(RequestValidationError);
    await expect(listExceptions({ page: 0 }))
      .rejects.toBeInstanceOf(RequestValidationError);
    await expect(listExceptions({ pageSize: 51 }))
      .rejects.toBeInstanceOf(RequestValidationError);
    expect(query).not.toHaveBeenCalled();
  });

  it('bounds exception search and validates institution identifiers', async () => {
    await expect(listExceptions({ search: 'x'.repeat(101) }))
      .rejects.toBeInstanceOf(RequestValidationError);
    await expect(listExceptions({ institutionId: '%%' }))
      .rejects.toBeInstanceOf(RequestValidationError);
    expect(query).not.toHaveBeenCalled();
  });

  it('validates report filters and pagination before querying', async () => {
    await expect(listReports({ period: '2026-13' }))
      .rejects.toBeInstanceOf(RequestValidationError);
    await expect(listReports({ institutionId: 'TZ/004' }))
      .rejects.toBeInstanceOf(RequestValidationError);
    await expect(listReports({ search: 'x'.repeat(101) }))
      .rejects.toBeInstanceOf(RequestValidationError);
    await expect(listReports({ page: Number.MAX_SAFE_INTEGER + 1 }))
      .rejects.toBeInstanceOf(RequestValidationError);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns data explorer counts from persisted tables', async () => {
    const result: QueryResult<QueryResultRow> = {
      command: 'SELECT',
      rowCount: 1,
      oid: 0,
      fields: [],
      rows: [{
        institutions: 14,
        reports: 337,
        indicators: 3022,
        review_signals: 9,
        latest_period: '2025-11',
      }],
    };
    vi.mocked(query).mockResolvedValueOnce(result);

    await expect(getDataExplorerStats()).resolves.toEqual({
      institutions: 14,
      reports: 337,
      indicators: 3022,
      reviewSignals: 9,
      latestPeriod: '2025-11',
    });
  });
});

describe('getExceptionById validation', () => {
  beforeEach(() => vi.mocked(query).mockReset());

  it('rejects empty or malformed exception IDs', async () => {
    await expect(getExceptionById('')).rejects.toBeInstanceOf(RequestValidationError);
    await expect(getExceptionById('a b')).rejects.toBeInstanceOf(RequestValidationError);
    await expect(getExceptionById('a!b')).rejects.toBeInstanceOf(RequestValidationError);
    expect(query).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when no rows returned', async () => {
    vi.mocked(query).mockResolvedValueOnce({ command: 'SELECT', rowCount: 0, oid: 0, fields: [], rows: [] });
    await expect(getExceptionById('EXC-TRN-CAR-LOW-TZ001-2026-10')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('updateExceptionStatus validation', () => {
  beforeEach(() => vi.mocked(query).mockReset());

  it('rejects invalid status values', async () => {
    await expect(updateExceptionStatus('EXC-TRN-CAR-LOW-TZ001-2026-10', 'pending' as 'open', 'demo.supervisor'))
      .rejects.toBeInstanceOf(RequestValidationError);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects malformed exception ID', async () => {
    await expect(updateExceptionStatus('bad id!', 'resolved', 'demo.supervisor'))
      .rejects.toBeInstanceOf(RequestValidationError);
    expect(query).not.toHaveBeenCalled();
  });

  it('throws NotFoundError if exception does not exist', async () => {
    // UPDATE returns empty rows => not found
    vi.mocked(query).mockResolvedValueOnce({ command: 'UPDATE', rowCount: 0, oid: 0, fields: [], rows: [] });
    await expect(updateExceptionStatus('EXC-MISSING', 'under_review', 'demo.supervisor'))
      .rejects.toBeInstanceOf(NotFoundError);
  });
});


vi.mock('./db', () => ({ query: vi.fn() }));

describe('repository input validation', () => {
  beforeEach(() => vi.mocked(query).mockReset());

  it('rejects unknown indicators before querying the database', async () => {
    await expect(getAnalytics(undefined, 'unlisted_indicator'))
      .rejects.toBeInstanceOf(RequestValidationError);
    await expect(getAnalytics('2026-13'))
      .rejects.toBeInstanceOf(RequestValidationError);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects invalid exception severity and pagination before querying', async () => {
    await expect(listExceptions({ severity: 'urgent' }))
      .rejects.toBeInstanceOf(RequestValidationError);
    await expect(listExceptions({ page: 0 }))
      .rejects.toBeInstanceOf(RequestValidationError);
    await expect(listExceptions({ pageSize: 51 }))
      .rejects.toBeInstanceOf(RequestValidationError);
    expect(query).not.toHaveBeenCalled();
  });

  it('bounds exception search and validates institution identifiers', async () => {
    await expect(listExceptions({ search: 'x'.repeat(101) }))
      .rejects.toBeInstanceOf(RequestValidationError);
    await expect(listExceptions({ institutionId: '%%' }))
      .rejects.toBeInstanceOf(RequestValidationError);
    expect(query).not.toHaveBeenCalled();
  });

  it('validates report filters and pagination before querying', async () => {
    await expect(listReports({ period: '2026-13' }))
      .rejects.toBeInstanceOf(RequestValidationError);
    await expect(listReports({ institutionId: 'TZ/004' }))
      .rejects.toBeInstanceOf(RequestValidationError);
    await expect(listReports({ search: 'x'.repeat(101) }))
      .rejects.toBeInstanceOf(RequestValidationError);
    await expect(listReports({ page: Number.MAX_SAFE_INTEGER + 1 }))
      .rejects.toBeInstanceOf(RequestValidationError);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns data explorer counts from persisted tables', async () => {
    const result: QueryResult<QueryResultRow> = {
      command: 'SELECT',
      rowCount: 1,
      oid: 0,
      fields: [],
      rows: [{
        institutions: 14,
        reports: 337,
        indicators: 3022,
        review_signals: 9,
        latest_period: '2025-11',
      }],
    };
    vi.mocked(query).mockResolvedValueOnce(result);

    await expect(getDataExplorerStats()).resolves.toEqual({
      institutions: 14,
      reports: 337,
      indicators: 3022,
      reviewSignals: 9,
      latestPeriod: '2025-11',
    });
  });
});

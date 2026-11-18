import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestValidationError } from './api-errors';
import { query } from './db';
import { getAnalytics, listExceptions } from './repository';

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
});

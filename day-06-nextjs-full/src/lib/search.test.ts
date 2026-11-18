import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestValidationError } from './api-errors';
import { query } from './db';
import {
  containsPattern,
  escapeLike,
  prefixPattern,
  searchAll,
  searchDocuments,
  searchInstitutions,
  searchReports,
  truncateExcerpt,
} from './search';

vi.mock('./db', () => ({ query: vi.fn() }));

describe('search query validation', () => {
  beforeEach(() => vi.mocked(query).mockReset());

  it('rejects queries outside the 2 to 200 character bound', async () => {
    await expect(searchAll('a')).rejects.toBeInstanceOf(RequestValidationError);
    await expect(searchAll('  a  ')).rejects.toBeInstanceOf(RequestValidationError);
    await expect(searchAll('')).rejects.toBeInstanceOf(RequestValidationError);
    await expect(searchAll('x'.repeat(201))).rejects.toBeInstanceOf(RequestValidationError);
    expect(query).not.toHaveBeenCalled();
  });

  it('skips document search for input without lexemes', async () => {
    await expect(searchDocuments('%%%')).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('surfaces document search failures instead of returning an empty result', async () => {
    vi.mocked(query).mockRejectedValueOnce(new Error('database unavailable'));
    await expect(searchDocuments('synthetic records')).rejects.toThrow('database unavailable');
  });
});

describe('LIKE pattern escaping', () => {
  it('escapes backslash, percent and underscore', () => {
    expect(escapeLike('10%_\\done')).toBe('10\\%\\_\\\\done');
  });

  it('builds escaped contains and prefix patterns', () => {
    expect(containsPattern('Bank_50%')).toBe('%Bank\\_50\\%%');
    expect(prefixPattern('2026_0%')).toBe('2026\\_0\\%%');
  });
});

describe('structured search parameter building', () => {
  beforeEach(() => {
    vi.mocked(query).mockReset();
    vi.mocked(query).mockResolvedValue({ rows: [] } as never);
  });

  it('uses escaped ILIKE patterns for report search', async () => {
    await searchReports('Bank_50%', { limit: 5 });

    const [text, values] = vi.mocked(query).mock.calls[0];
    expect(text).toContain('i.institution_name ILIKE $1');
    expect(text).toContain('i.region ILIKE $1');
    expect(text).toContain('r.reporting_period ILIKE $2');
    expect(values).toEqual(['%Bank\\_50\\%%', 'Bank\\_50\\%%', 5]);
  });

  it('uses escaped ILIKE patterns and a bounded limit for institution search', async () => {
    await searchInstitutions('Region_1', { limit: 100 });

    const [text, values] = vi.mocked(query).mock.calls[0];
    expect(text).toContain('i.institution_name ILIKE $1');
    expect(text).toContain('i.region ILIKE $1');
    expect(text).toContain('i.institution_type ILIKE $1');
    expect(values).toEqual(['%Region\\_1%', 25]);
  });
});

describe('excerpt truncation', () => {
  it('normalizes whitespace and keeps short content intact', () => {
    expect(truncateExcerpt('  alpha\n\n beta  ')).toBe('alpha beta');
  });

  it('truncates long content to 300 characters with an ellipsis', () => {
    const excerpt = truncateExcerpt('x'.repeat(400));
    expect(excerpt).toHaveLength(300);
    expect(excerpt.endsWith('…')).toBe(true);
  });

  it('honours a custom maximum length', () => {
    expect(truncateExcerpt('abcdef', 4)).toBe('abc…');
  });
});

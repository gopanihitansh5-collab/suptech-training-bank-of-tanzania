import { describe, expect, it } from 'vitest';
import { compileQuerySpec, inferQuerySpec, validateQuerySpec } from './query-engine';

describe('prompt-to-query engine', () => {
  it('infers a bounded exception query from a free-form prompt', () => {
    const spec = inferQuerySpec('Show critical open exceptions for TZ004 in 2026-10');
    expect(spec.dataset).toBe('supervisory_exceptions');
    expect(spec.limit).toBe(100);
    expect(spec.filters).toEqual(expect.arrayContaining([
      { field: 'institutionId', operator: 'eq', value: 'TZ004' },
      { field: 'period', operator: 'eq', value: '2026-10' },
      { field: 'severity', operator: 'eq', value: 'critical' },
      { field: 'status', operator: 'eq', value: 'open' },
    ]));
  });

  it('rejects identifiers and operators outside the allowlist', () => {
    expect(() => validateQuerySpec({
      dataset: 'institutions',
      fields: ['institutionId', 'DROP TABLE institutions'],
    })).toThrow('not allowlisted');
    expect(() => validateQuerySpec({
      dataset: 'institutions',
      fields: ['institutionId'],
      filters: [{ field: 'status', operator: 'drop', value: 'active' }],
    })).toThrow('operator');
  });

  it('compiles parameter placeholders instead of interpolating values', () => {
    const spec = validateQuerySpec({
      dataset: 'institution_reports',
      fields: ['institutionId', 'period', 'deposits'],
      filters: [{ field: 'institutionId', operator: 'eq', value: "TZ004' OR 1=1 --" }],
      limit: 10,
    });
    const compiled = compileQuerySpec(spec);
    expect(compiled.values).toContain("TZ004' OR 1=1 --");
    expect(compiled.sql).not.toContain("TZ004'");
    expect(compiled.sql).toContain('$1');
  });

  it('limits result sizes and rejects oversized queries', () => {
    expect(() => validateQuerySpec({
      dataset: 'institutions',
      fields: ['institutionId'],
      limit: 501,
    })).toThrow('between 1 and 500');
  });
});

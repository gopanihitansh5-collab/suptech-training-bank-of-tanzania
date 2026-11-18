import { describe, expect, it } from 'vitest';
import { assertSafeDatabaseUrl } from './db-config';

describe('Day 6 database connection guard', () => {
  it('requires an explicit local PostgreSQL connection', () => {
    expect(() => assertSafeDatabaseUrl(undefined)).toThrow(/DATABASE_URL is required/);
    expect(() => assertSafeDatabaseUrl('postgresql://user:pass@remote.example:5433/day6'))
      .toThrow(/sslmode=require/);
  });

  it('refuses the unrelated local port-5432 cluster', () => {
    expect(() => assertSafeDatabaseUrl('postgresql://user:pass@127.0.0.1:5432/postgres'))
      .toThrow(/loopback port 5433/);
  });

  it('accepts only the dedicated local Day 6 database port', () => {
    expect(assertSafeDatabaseUrl('postgresql://user:pass@127.0.0.1:5433/suptech_day6'))
      .toContain(':5433/');
  });

  it('accepts a managed provider that explicitly requires TLS', () => {
    expect(assertSafeDatabaseUrl('postgresql://user:pass@ep-day6.eu-central-1.aws.neon.tech/suptech_day6?sslmode=require'))
      .toContain('sslmode=require');
  });

  it('refuses remote providers that disable TLS', () => {
    expect(() => assertSafeDatabaseUrl('postgresql://user:pass@ep-day6.eu-central-1.aws.neon.tech/suptech_day6?sslmode=disable'))
      .toThrow(/sslmode=require/);
    expect(() => assertSafeDatabaseUrl('postgresql://user:pass@ep-day6.eu-central-1.aws.neon.tech/suptech_day6'))
      .toThrow(/sslmode=require/);
  });
});

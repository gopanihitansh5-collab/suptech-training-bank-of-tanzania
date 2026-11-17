import { describe, expect, it, vi } from 'vitest';

import { api, apiUrl, ApiError, getJson } from '../api';

describe('the API client', () => {
  it('builds a URL without a query string when there are no filters', () => {
    expect(apiUrl('/api/v1/exceptions')).toBe('/api/v1/exceptions');
  });

  it('leaves out the filters that are empty', () => {
    const url = apiUrl('/api/v1/exceptions', {
      severity: 'CRITICAL',
      reporting_period: '',
      institution_id: undefined,
    });
    expect(url).toBe('/api/v1/exceptions?severity=CRITICAL');
  });

  it('does not send credentials from the browser', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ count: 0, exceptions: [] }),
    });

    await getJson('/api/v1/exceptions', undefined, fetchImpl as never);

    const [, options] = fetchImpl.mock.calls[0];
    expect(options.headers.Authorization).toBeUndefined();
  });

  it('calls the same-origin API without credential parameters', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ count: 0, exceptions: [] }),
    });

    await api.exceptions(undefined, fetchImpl as never);

    const [url] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe('/api/v1/exceptions');
  });

  it('raises an error when the API refuses the request', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'A valid bearer token is required.',
    });

    await expect(
      api.exceptions(undefined, fetchImpl as never),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('carries the status on the error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'no data source',
    });

    await expect(
      api.exceptions(undefined, fetchImpl as never),
    ).rejects.toMatchObject({ status: 503 });
  });

  it('asks for the institution by identifier', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ institution_id: 'TZ013' }),
    });

    await api.institution('TZ013', fetchImpl as never);

    const [url] = fetchImpl.mock.calls[0];
    expect(String(url)).toContain('/api/v1/institutions/TZ013');
  });

  it('escapes an identifier that needs it', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    await api.exceptionDetail('a b/c', fetchImpl as never);

    const [url] = fetchImpl.mock.calls[0];
    expect(String(url)).toContain('a%20b%2Fc');
  });
});

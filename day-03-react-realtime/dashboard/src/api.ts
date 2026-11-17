/**
 * The API client.
 *
 * The dashboard has one door and it is the Day 2 API. Every number on the
 * screen comes through this file, and nothing is hard coded here or
 * anywhere else in the frontend. That is the whole point of the layer
 * boundary the architecture describes: the dashboard can only ever show
 * what survived validation, because the submitted file is not reachable
 * from here.
 *
 * The token is read from the environment of the browser at build time, and
 * the operator can also type it in at runtime. It is held in memory only:
 * it is never written to storage, never put in a URL and never logged.
 */

import type {
  ExceptionList,
  IndicatorList,
  InstitutionDetail,
  InstitutionList,
  Meta,
  SectorSummary,
  SupervisoryException,
} from './types';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** The base URL of the API. Empty means the same origin as the page. */
export const API_BASE_URL: string = (
  import.meta.env?.VITE_API_BASE_URL ?? ''
).replace(/\/$/, '');

export type QueryParams = Record<string, string | number | undefined | null>;

/** Build the URL of an API call, with its query string. */
export function apiUrl(path: string, params?: QueryParams): string {
  const search = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }
    search.set(key, String(value));
  });
  const query = search.toString();
  return `${API_BASE_URL}${path}${query ? `?${query}` : ''}`;
}

/** Call the API and return the parsed answer. */
export async function getJson<T>(
  path: string,
  token: string,
  params?: QueryParams,
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const response = await fetchImpl(apiUrl(path, params), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    let detail = `the API answered ${response.status}`;
    try {
      const body = await response.text();
      if (body) {
        detail = body;
      }
    } catch {
      // The status is the message when the body cannot be read.
    }
    throw new ApiError(response.status, detail);
  }

  return (await response.json()) as T;
}

export interface ExceptionFilters {
  institution_id?: string;
  reporting_period?: string;
  severity?: string;
  indicator_id?: string;
  threshold_id?: string;
  run_id?: string;
}

export const api = {
  summary: (token: string, reportingPeriod?: string, fetchImpl?: typeof fetch) =>
    getJson<SectorSummary>(
      '/api/v1/summary',
      token,
      { reporting_period: reportingPeriod },
      fetchImpl,
    ),

  exceptions: (token: string, filters?: ExceptionFilters, fetchImpl?: typeof fetch) =>
    getJson<ExceptionList>(
      '/api/v1/exceptions',
      token,
      filters as QueryParams,
      fetchImpl,
    ),

  exceptionDetail: (
    token: string,
    exceptionId: string,
    fetchImpl?: typeof fetch,
  ) =>
    getJson<SupervisoryException>(
      `/api/v1/exceptions/${encodeURIComponent(exceptionId)}`,
      token,
      undefined,
      fetchImpl,
    ),

  indicators: (token: string, filters?: QueryParams, fetchImpl?: typeof fetch) =>
    getJson<IndicatorList>('/api/v1/indicators', token, filters, fetchImpl),

  institutions: (token: string, fetchImpl?: typeof fetch) =>
    getJson<InstitutionList>('/api/v1/institutions', token, undefined, fetchImpl),

  institution: (
    token: string,
    institutionId: string,
    fetchImpl?: typeof fetch,
  ) =>
    getJson<InstitutionDetail>(
      `/api/v1/institutions/${encodeURIComponent(institutionId)}`,
      token,
      undefined,
      fetchImpl,
    ),

  meta: (token: string, fetchImpl?: typeof fetch) =>
    getJson<Meta>('/api/v1/meta', token, undefined, fetchImpl),
};

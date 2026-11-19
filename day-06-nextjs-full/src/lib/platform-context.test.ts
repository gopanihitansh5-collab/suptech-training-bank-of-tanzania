import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./db', () => ({
  query: vi.fn(),
}));

import { query } from './db';
import {
  clearPlatformContextCache,
  getPlatformContext,
} from './platform-context';

const countsRow = {
  institutions: 14,
  reports: 168,
  indicators: 120,
  exceptions: 23,
  open_exceptions: 8,
  documents: 2,
  chunks: 31,
  latest_period: '2026-10',
};

const periodRows = [
  { reporting_period: '2026-10' },
  { reporting_period: '2026-09' },
  { reporting_period: '2026-08' },
];

const institutionRows = [
  {
    institution_id: 'TZ001',
    institution_name: 'Kilimanjaro Commercial Bank',
    institution_type: 'commercial_bank',
    region: 'Kilimanjaro',
    tier: 'Tier 1',
    status: 'active',
  },
  {
    institution_id: 'TZ004',
    institution_name: 'Dodoma Community Bank',
    institution_type: 'community_bank',
    region: 'Dodoma',
    tier: 'Tier 2',
    status: 'monitoring',
  },
];

const indicatorRows = [
  {
    indicator_id: 'deposits',
    label: 'Customer deposits',
    unit: 'TZS bn',
    formula: 'reported deposits',
  },
  {
    indicator_id: 'npl_ratio',
    label: 'Non-performing loan ratio',
    unit: '%',
    formula: 'reported NPL ratio',
  },
];

const thresholdRows = [
  {
    indicator_id: 'capital_adequacy',
    operator: 'lt',
    threshold_value: 10,
    severity: 'critical',
    label: 'Capital ratio review signal',
  },
  {
    indicator_id: 'npl_ratio',
    operator: 'gt',
    threshold_value: 8,
    severity: 'high',
    label: 'Elevated NPL review signal',
  },
];

const severityRows = [
  { severity: 'critical', count: 2 },
  { severity: 'high', count: 6 },
];

const statusRows = [
  { status: 'open', count: 8 },
  { status: 'resolved', count: 15 },
];

const openExceptionRows = [
  {
    institution_id: 'TZ004',
    institution_name: 'Dodoma Community Bank',
    indicator_id: 'npl_ratio',
    reporting_period: '2026-10',
    observed_value: 9.1,
    threshold_value: 8,
    severity: 'high',
    message: 'Observed NPL ratio exceeded the training threshold.',
  },
];

const ingestionRow = {
  latest_ingestion_status: 'completed',
  latest_document_at: '2026-10-20T10:00:00Z',
};

function installQuery(options: {
  institutions?: typeof institutionRows;
  fail?: boolean;
} = {}): void {
  vi.mocked(query).mockImplementation(async (sql: string) => {
    if (options.fail) throw new Error('database offline');
    if (sql.includes('AS latest_period')) {
      return { rows: [countsRow] } as never;
    }
    if (sql.includes('DISTINCT reporting_period')) {
      return { rows: periodRows } as never;
    }
    if (sql.includes('FROM institutions') && sql.includes('ORDER BY institution_id')) {
      return { rows: options.institutions ?? institutionRows } as never;
    }
    if (sql.includes('FROM indicator_definitions')) {
      return { rows: indicatorRows } as never;
    }
    if (sql.includes('FROM threshold_configurations')) {
      return { rows: thresholdRows } as never;
    }
    if (sql.includes('GROUP BY severity')) {
      return { rows: severityRows } as never;
    }
    if (sql.includes('GROUP BY status')) {
      return { rows: statusRows } as never;
    }
    if (sql.includes('FROM supervisory_exceptions e') && sql.includes('LIMIT 5')) {
      return { rows: openExceptionRows } as never;
    }
    if (sql.includes('ingestion_jobs') && sql.includes('latest_ingestion_status')) {
      return { rows: [ingestionRow] } as never;
    }
    throw new Error(`Unexpected query: ${sql}`);
  });
}

beforeEach(() => {
  clearPlatformContextCache();
  vi.mocked(query).mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  clearPlatformContextCache();
});

describe('platform context', () => {
  it('maps database rows into stats and compact sections', async () => {
    installQuery();
    const context = await getPlatformContext();

    expect(context.stats).toMatchObject({
      institutions: 14,
      reports: 168,
      indicators: 120,
      exceptions: 23,
      openExceptions: 8,
      documents: 2,
      chunks: 31,
      latestPeriod: '2026-10',
      latestIngestionStatus: 'completed',
    });
    expect(context.stats.periods).toEqual(['2026-08', '2026-09', '2026-10']);

    for (const section of [
      'Dataset',
      'Periods',
      'Institutions',
      'Indicators',
      'Training thresholds',
      'Exception summary',
      'Top open signals',
      'Documents',
    ]) {
      expect(context.text).toContain(section);
    }
    expect(context.text).toContain('TZ004');
    expect(context.text).toContain('Dodoma Community Bank');
    expect(context.text).toContain('Customer deposits');
    expect(context.text).toContain('capital_adequacy lt 10 (critical)');
    expect(context.text).toContain('observed 9.1 vs threshold 8');
    expect(context.text).toContain('synthetic data only');
    expect(context.text).toContain('thresholds are training values');
    expect(context.text).toContain('review signals');
    expect(context.text.length).toBeLessThanOrEqual(6000);
  });

  it('reuses the cached context for 60 seconds', async () => {
    installQuery();
    await getPlatformContext();
    const callsAfterFirst = vi.mocked(query).mock.calls.length;
    await getPlatformContext();

    expect(vi.mocked(query).mock.calls.length).toBe(callsAfterFirst);
    expect(callsAfterFirst).toBeGreaterThan(0);
  });

  it('truncates long institution lists while keeping guardrails', async () => {
    const longName = 'Synthetic Institution With A Very Long Training Name '.repeat(4);
    const institutions = Array.from({ length: 80 }, (_, index) => ({
      institution_id: `TZ${String(index + 1).padStart(3, '0')}`,
      institution_name: longName,
      institution_type: 'commercial_bank',
      region: 'Dar es Salaam',
      tier: 'Tier 1',
      status: 'active',
    }));
    installQuery({ institutions });
    const context = await getPlatformContext();

    expect(context.text.length).toBeLessThanOrEqual(6000);
    expect(context.text).toContain('synthetic data only');
    expect(context.text).toContain('training values');
  });

  it('returns a minimal zeroed context when the database fails', async () => {
    installQuery({ fail: true });
    const context = await getPlatformContext();

    expect(context.stats).toMatchObject({
      institutions: 0,
      reports: 0,
      exceptions: 0,
      openExceptions: 0,
      documents: 0,
      chunks: 0,
      latestPeriod: null,
    });
    expect(context.text).toContain('context unavailable');
    expect(context.text).toContain('synthetic data only');
  });

  it('never includes secret environment values in the context text', async () => {
    vi.stubEnv('GROQ_API_KEY', 'sk-live-should-never-appear');
    vi.stubEnv('DATABASE_URL', 'postgres://secret-user:secret-pass@db.example.com/app');
    installQuery();
    const context = await getPlatformContext();

    expect(context.text).not.toContain('sk-live-should-never-appear');
    expect(context.text).not.toContain('secret-pass');
  });
});

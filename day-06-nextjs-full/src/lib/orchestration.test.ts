import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AGENT_CONFIGS,
  classifySupervisoryIntent,
  executeAgent,
  executeSupervisoryWorkflow,
  isLocalModelAvailable,
  listAvailableAgents,
  orchestrateAgents,
  verifySupervisoryOutput,
} from './orchestration';

vi.mock('./repository', () => ({
  getOverview: vi.fn().mockResolvedValue({
    period: '2026-10',
    summary: {
      institutions: 14,
      reportsReceived: 14,
      reportsExpected: 14,
      openExceptions: 3,
      criticalExceptions: 1,
      depositsTzsBillions: 31400,
      loansTzsBillions: 19800,
      completenessPercent: 100,
    },
    trend: [],
    recentExceptions: [],
  }),
  getInstitutionDetail: vi.fn().mockImplementation((instId: string) =>
    Promise.resolve({
      institution: {
        institutionId: instId.toUpperCase(),
        name: 'Kilimanjaro Commercial Bank',
        type: 'commercial_bank',
        region: 'Kilimanjaro',
        tier: 'tier_1',
        status: 'active',
        latestPeriod: '2026-10',
        depositsTzsBillions: 4200,
        capitalAdequacyRatioPercent: 14.5,
        nplRatioPercent: 6.8,
        openExceptions: 2,
      },
      reports: [],
      exceptions: [],
      analytics: [],
    })
  ),
  getAnalytics: vi.fn().mockResolvedValue({
    period: '2026-10',
    indicatorId: 'npl_ratio',
    indicators: [],
    trend: [],
  }),
  listExceptions: vi.fn().mockResolvedValue({
    items: [
      {
        id: 'EX-001',
        institutionId: 'TZ004',
        institutionName: 'Kilimanjaro Commercial Bank',
        reportId: 'REP-001',
        period: '2026-10',
        indicatorId: 'npl_ratio',
        observedValue: 6.8,
        thresholdValue: 5.0,
        severity: 'high',
        status: 'open',
        message: 'Observed NPL ratio exceeded illustrative threshold.',
        createdAt: '2026-10-15T00:00:00Z',
      },
    ],
    page: 1,
    pageSize: 10,
    total: 1,
    totalPages: 1,
  }),
}));

vi.mock('./grounded-retrieval', () => ({
  searchGroundedEvidence: vi.fn().mockResolvedValue({
    hits: [
      {
        kind: 'document',
        id: 'DOC-01',
        title: 'Prudential Guidelines on Asset Quality',
        excerpt: 'Commercial banks must maintain an NPL ratio below the 5% supervisory benchmark.',
        citation: { documentId: 'DOC-01' },
        rank: 1,
      },
    ],
    mode: 'hybrid',
  }),
}));

function modelResponse(content: string): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content } }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

describe('local model orchestration', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.stubEnv('LM_STUDIO_BASE_URL', 'http://127.0.0.1:1235/v1');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('lists every configured role with its UI description', () => {
    const agents = listAvailableAgents();
    expect(agents).toHaveLength(Object.keys(AGENT_CONFIGS).length);
    expect(agents.every((agent) => agent.description.length > 0)).toBe(true);
  });

  it('includes the complete canonical supervisory team', () => {
    const canonicalRoles = [
      'supervisor-router',
      'institution-context',
      'data-analyst',
      'document-retrieval',
      'exception-indicator',
      'report-agent',
      'verification-agent',
      'response-composer',
    ];

    for (const roleId of canonicalRoles) {
      expect(AGENT_CONFIGS[roleId]).toBeDefined();
      expect(AGENT_CONFIGS[roleId].id).toBe(roleId);
      expect(AGENT_CONFIGS[roleId].systemPrompt).toContain('synthetic');
    }
  });

  it('rejects unknown agents without calling the model', async () => {
    const result = await executeAgent({
      agentId: 'unknown-agent',
      userMessage: 'Explain this synthetic example.',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown agent ID');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends valid work to the configured loopback model and returns its response', async () => {
    vi.mocked(fetch).mockResolvedValue(modelResponse('Synthetic data only.'));

    const result = await executeAgent({
      agentId: 'data-ingestion',
      userMessage: 'Explain this synthetic example.',
    });

    expect(result).toMatchObject({
      success: true,
      agentId: 'data-ingestion',
      agentName: 'Data Ingestion Agent',
      response: 'Synthetic data only.',
    });
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:1235/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('rejects non-loopback model endpoints without sending data', async () => {
    vi.stubEnv('LM_STUDIO_BASE_URL', 'https://models.example.com/v1');

    const result = await executeAgent({
      agentId: 'data-ingestion',
      userMessage: 'Explain this synthetic example.',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('loopback');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns an explicit failure for an empty model response', async () => {
    vi.mocked(fetch).mockResolvedValue(modelResponse('  '));

    const result = await executeAgent({
      agentId: 'data-ingestion',
      userMessage: 'Explain this synthetic example.',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('empty or invalid response');
  });

  it('checks model readiness through the loopback models endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 'qwen/qwen3.6-35b-a3b' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(isLocalModelAvailable()).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:1235/v1/models',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('validates empty, oversized and duplicate agent requests before model calls', async () => {
    const empty = await orchestrateAgents([]);
    const tooLong = await orchestrateAgents([{
      agentId: 'data-ingestion',
      userMessage: 'x'.repeat(2001),
    }]);
    const duplicate = await orchestrateAgents([
      { agentId: 'data-ingestion', userMessage: 'first task' },
      { agentId: 'data-ingestion', userMessage: 'second task' },
    ]);

    expect(empty.error).toContain('at least one');
    expect(tooLong.error).toContain('2-2000');
    expect(duplicate.error).toContain('only be selected once');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('runs valid selected roles in parallel and returns each result', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(modelResponse('First role response.'))
      .mockResolvedValueOnce(modelResponse('Second role response.'));

    const result = await orchestrateAgents([
      { agentId: 'data-ingestion', userMessage: 'Validate this fictional sample.' },
      { agentId: 'prudential-analysis', userMessage: 'Explain this synthetic ratio.' },
    ]);

    expect(result.success).toBe(true);
    expect(result.agents.map((agent) => agent.response)).toEqual([
      'First role response.',
      'Second role response.',
    ]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('supervisory workflow intent routing', () => {
  it('correctly classifies analytical queries and extracts parameters', () => {
    const result = classifySupervisoryIntent('Analyze portfolio deposits and NPL trends for 2026-10');
    expect(result.intent).toBe('analytical');
    expect(result.period).toBe('2026-10');
    expect(result.indicatorId).toBe('npl_ratio');
  });

  it('correctly classifies exception investigations and extracts institutions', () => {
    const result = classifySupervisoryIntent('Investigate high-severity exceptions for TZ004');
    expect(result.intent).toBe('exception_explanation');
    expect(result.institutionId).toBe('TZ004');
  });

  it('correctly classifies regulatory document queries', () => {
    const result = classifySupervisoryIntent('What are the minimum capital adequacy requirements in regulatory circulars?');
    expect(result.intent).toBe('document');
  });

  it('correctly classifies combined document and analytics queries', () => {
    const result = classifySupervisoryIntent('Explain reporting rules and compliance status for deposit ratios');
    expect(result.intent).toBe('combined');
  });

  it('correctly classifies custom report requests', () => {
    const result = classifySupervisoryIntent('Generate comprehensive supervisory report for 2026-10');
    expect(result.intent).toBe('report');
    expect(result.period).toBe('2026-10');
  });
});

describe('supervisory verification guardrails', () => {
  it('passes verification when citations and calculations are sound', () => {
    const report = verifySupervisoryOutput({
      intent: 'combined',
      retrievedSources: [{ id: 'DOC-1', title: 'Circular 10' }],
      citationsInResponse: ['S1'],
      analyticalResults: { depositsTzsBillions: 1200, nplRatioPercent: 4.2 },
    });

    expect(report.verified).toBe(true);
    expect(report.checks).toHaveLength(3);
    expect(report.checks.every((c) => c.status === 'passed')).toBe(true);
  });

  it('fails verification when an ungrounded citation is cited', () => {
    const report = verifySupervisoryOutput({
      intent: 'combined',
      retrievedSources: [{ id: 'DOC-1', title: 'Circular 10' }],
      citationsInResponse: ['S1', 'S99'],
    });

    expect(report.verified).toBe(false);
    const fidelityCheck = report.checks.find((c) => c.name === 'citation_fidelity');
    expect(fidelityCheck?.status).toBe('failed');
    expect(fidelityCheck?.detail).toContain('ungrounded');
  });

  it('fails verification when calculations contain out-of-bounds percentages', () => {
    const report = verifySupervisoryOutput({
      intent: 'analytical',
      analyticalResults: { nplRatioPercent: 5000 },
    });

    expect(report.verified).toBe(false);
    const calcCheck = report.checks.find((c) => c.name === 'calculation_sanity');
    expect(calcCheck?.status).toBe('failed');
  });
});

describe('executeSupervisoryWorkflow execution & offline fallback', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.stubEnv('LM_STUDIO_BASE_URL', 'http://127.0.0.1:1235/v1');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('executes deterministically when local LM Studio is offline', async () => {
    // fetch rejects simulating LM Studio offline
    vi.mocked(fetch).mockRejectedValue(new Error('Connection refused'));

    const result = await executeSupervisoryWorkflow(
      'Analyze portfolio deposits and NPL trends for 2026-10',
      { period: '2026-10' }
    );

    expect(result.intent).toBe('analytical');
    expect(result.scope.period).toBe('2026-10');
    expect(result.activeAgents).toContain('supervisor-router');
    expect(result.activeAgents).toContain('data-analyst');
    expect(result.activeAgents).toContain('verification-agent');
    expect(result.activeAgents).toContain('response-composer');
    expect(result.plan.steps.length).toBeGreaterThan(0);
    expect(result.verification.verified).toBe(true);
    expect(result.response.executiveSummary).toContain('Portfolio overview');
    expect(result.response.dataCards).toBeDefined();
    expect(result.response.disclaimer).toContain('Synthetic demonstration data');
    expect(result.modelUsed).toBe('deterministic-fallback');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('executes combined query with parallel data and retrieval handoffs', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('LM Studio offline'));

    const result = await executeSupervisoryWorkflow(
      'Explain reporting rules and compliance status for TZ001'
    );

    expect(result.intent).toBe('combined');
    expect(result.activeAgents).toContain('supervisor-router');
    expect(result.activeAgents).toContain('institution-context');
    expect(result.activeAgents).toContain('data-analyst');
    expect(result.activeAgents).toContain('document-retrieval');
    expect(result.activeAgents).toContain('verification-agent');
    expect(result.activeAgents).toContain('response-composer');
    expect(result.retrievedSources).toBeDefined();
    expect(result.response.citations).toBeDefined();
    expect(result.verification.verified).toBe(true);
  });

  it('enriches response when local LM Studio model is online', async () => {
    vi.mocked(fetch)
      // Call to /models (isLocalChatModelAvailable)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ id: 'qwen/qwen3.6-35b-a3b' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
      // Call to /chat/completions (generateLocalChatCompletion)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    'Executive summary enriched by local Qwen model.\n\nDetailed supervisory analysis contextualizing the synthetic metrics and regulatory compliance signals.',
                },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      );

    const result = await executeSupervisoryWorkflow('Analyze portfolio deposits for 2026-10');

    expect(result.modelUsed).toBe('local-qwen');
    expect(result.response.executiveSummary).toContain('Executive summary enriched by local Qwen');
    expect(result.response.detail).toContain('Detailed supervisory analysis');
  });

  it('validates question length before execution', async () => {
    await expect(executeSupervisoryWorkflow('   ')).rejects.toThrow('between 2 and 2000 characters');
    await expect(executeSupervisoryWorkflow('a')).rejects.toThrow('between 2 and 2000 characters');
    await expect(executeSupervisoryWorkflow('x'.repeat(2001))).rejects.toThrow('between 2 and 2000 characters');
  });
});

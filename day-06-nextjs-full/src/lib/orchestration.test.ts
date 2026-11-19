import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./repository', () => ({
  getOverview: vi.fn(),
  getInstitutionDetail: vi.fn(),
  getAnalytics: vi.fn(),
  listExceptions: vi.fn(),
  listInstitutions: vi.fn(),
}));

vi.mock('./grounded-retrieval', () => ({
  searchGroundedEvidence: vi.fn(),
}));

const providerMocks = vi.hoisted(() => ({
  generateChatCompletion: vi.fn(),
  formatModelResponseText: vi.fn((content: string) =>
    content
      .replace(/(^|\n)\s{0,3}#{1,6}\s*/g, '$1')
      .replace(/(^|\n)\s*[*+-]\s+/g, '$1')
      .replace(/[*#]/g, '')
      .trim(),
  ),
  isChatProviderAvailable: vi.fn(),
  getActiveChatProviderName: vi.fn(),
}));

vi.mock('./model-provider', () => providerMocks);

const platformContextMock = vi.hoisted(() => ({
  getPlatformContext: vi.fn(),
}));

vi.mock('./platform-context', () => platformContextMock);

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
import {
  getAnalytics,
  getInstitutionDetail,
  getOverview,
  listExceptions,
  listInstitutions,
} from './repository';
import { searchGroundedEvidence } from './grounded-retrieval';

const overview = {
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
  trend: [
    {
      period: '2026-09',
      depositsTzsBillions: 30000,
      loansTzsBillions: 19000,
      completenessPercent: 99,
      exceptions: 2,
    },
    {
      period: '2026-10',
      depositsTzsBillions: 31400,
      loansTzsBillions: 19800,
      completenessPercent: 100,
      exceptions: 3,
    },
  ],
  recentExceptions: [
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
};

const exception = overview.recentExceptions[0];

const institutionDetail = {
  institution: {
    institutionId: 'TZ004',
    name: 'Kilimanjaro Commercial Bank',
    type: 'commercial_bank',
    region: 'Kilimanjaro',
    tier: 'Tier 1',
    status: 'active',
    latestPeriod: '2026-10',
    depositsTzsBillions: 4200,
    capitalAdequacyRatioPercent: 14.5,
    nplRatioPercent: 6.8,
    openExceptions: 2,
  },
  reports: [
    {
      reportId: 'R-3',
      period: '2026-10',
      depositsTzsBillions: 4200,
      loansTzsBillions: 2600,
      capitalAdequacyRatioPercent: 14.5,
      liquidityRatioPercent: 120,
      nplRatioPercent: 6.8,
      completenessPercent: 98,
      sourceRecordIds: [],
    },
    {
      reportId: 'R-2',
      period: '2026-09',
      depositsTzsBillions: 4000,
      loansTzsBillions: 2500,
      capitalAdequacyRatioPercent: 14.1,
      liquidityRatioPercent: 118,
      nplRatioPercent: 7.2,
      completenessPercent: 96,
      sourceRecordIds: [],
    },
    {
      reportId: 'R-1',
      period: '2026-08',
      depositsTzsBillions: 3800,
      loansTzsBillions: 2400,
      capitalAdequacyRatioPercent: 13.9,
      liquidityRatioPercent: 115,
      nplRatioPercent: 7.5,
      completenessPercent: 95,
      sourceRecordIds: [],
    },
  ],
  exceptions: [exception],
};

const institutionPage = {
  items: [
    {
      institutionId: 'TZ001',
      name: 'Bank One',
      type: 'commercial_bank',
      region: 'Dar es Salaam',
      tier: 'Tier 1',
      status: 'active',
      latestPeriod: '2026-10',
      depositsTzsBillions: 12000,
      capitalAdequacyRatioPercent: 15,
      nplRatioPercent: 4.2,
      openExceptions: 1,
    },
    {
      institutionId: 'TZ004',
      name: 'Kilimanjaro Commercial Bank',
      type: 'commercial_bank',
      region: 'Kilimanjaro',
      tier: 'Tier 1',
      status: 'active',
      latestPeriod: '2026-10',
      depositsTzsBillions: 4200,
      capitalAdequacyRatioPercent: 14.5,
      nplRatioPercent: 6.8,
      openExceptions: 2,
    },
    {
      institutionId: 'TZ007',
      name: 'Southern Highlands Bank',
      type: 'community_bank',
      region: 'Mbeya',
      tier: 'Tier 2',
      status: 'monitoring',
      latestPeriod: '2026-10',
      depositsTzsBillions: 3100,
      capitalAdequacyRatioPercent: 9.2,
      nplRatioPercent: 9.4,
      openExceptions: 4,
    },
  ],
  page: 1,
  pageSize: 50,
  total: 3,
  totalPages: 1,
};

function installRepositoryMocks(): void {
  vi.mocked(getOverview).mockResolvedValue(overview);
  vi.mocked(getInstitutionDetail).mockResolvedValue(institutionDetail);
  vi.mocked(getAnalytics).mockResolvedValue({
    period: '2026-10',
    indicators: [],
    trend: [],
  });
  vi.mocked(listExceptions).mockResolvedValue({
    items: [exception],
    page: 1,
    pageSize: 10,
    total: 1,
    totalPages: 1,
  });
  vi.mocked(listInstitutions).mockResolvedValue(institutionPage);
}

function installEvidenceMock(): void {
  vi.mocked(searchGroundedEvidence).mockResolvedValue({
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
  });
}

beforeEach(() => {
  installRepositoryMocks();
  installEvidenceMock();
  platformContextMock.getPlatformContext.mockResolvedValue({
    generatedAt: '2026-10-20T10:00:00.000Z',
    stats: {
      institutions: 14,
      reports: 168,
      indicators: 120,
      exceptions: 23,
      openExceptions: 8,
      documents: 2,
      chunks: 31,
      latestPeriod: '2026-10',
      latestIngestionStatus: 'completed',
      periods: ['2025-11', '2026-10'],
    },
    text: 'Dataset: 14 synthetic institutions; latest period 2026-10.\nGuardrails: synthetic data only.',
  });
  providerMocks.generateChatCompletion.mockReset();
  providerMocks.isChatProviderAvailable.mockReset();
  providerMocks.isChatProviderAvailable.mockResolvedValue(false);
  providerMocks.getActiveChatProviderName.mockReset();
  providerMocks.getActiveChatProviderName.mockReturnValue('lmstudio');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('agent orchestration', () => {
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

  it('rejects unknown agents without calling the provider', async () => {
    const result = await executeAgent({
      agentId: 'unknown-agent',
      userMessage: 'Explain this synthetic example.',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown agent ID');
    expect(providerMocks.generateChatCompletion).not.toHaveBeenCalled();
  });

  it('sends work with aggregate dashboard context and omits institution and document details', async () => {
    providerMocks.generateChatCompletion.mockResolvedValue('Synthetic data only.');

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
    const [messages] = providerMocks.generateChatCompletion.mock.calls[0];
    expect(messages[0].content).toContain('bounded synthetic aggregate dashboard context');
    expect(messages[0].content).toContain('reportingPeriod');
    expect(messages[0].content).toContain('depositsTzsBillions');
    expect(messages[0].content).not.toContain('Kilimanjaro Commercial Bank');
    expect(messages[0].content).not.toContain('TZ004');
    expect(messages[0].content).not.toContain('DOC-01');
  });

  it('returns an explicit failure when the provider is unreachable', async () => {
    providerMocks.generateChatCompletion.mockRejectedValue(
      new Error('The local chat model could not be reached.'),
    );

    const result = await executeAgent({
      agentId: 'data-ingestion',
      userMessage: 'Explain this synthetic example.',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('could not be reached');
  });

  it('returns an explicit failure for an empty provider response', async () => {
    providerMocks.generateChatCompletion.mockResolvedValue('   ');

    const result = await executeAgent({
      agentId: 'data-ingestion',
      userMessage: 'Explain this synthetic example.',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('empty or invalid response');
  });

  it('formats direct agent output without Markdown markers', async () => {
    providerMocks.generateChatCompletion.mockResolvedValue(
      '### Summary\n\n* Review the synthetic sample.',
    );

    const result = await executeAgent({
      agentId: 'data-ingestion',
      userMessage: 'Explain this synthetic example.',
    });

    expect(result.response).toBe('Summary\nReview the synthetic sample.');
    expect(result.response).not.toMatch(/[#*]/);
  });

  it('checks provider readiness', async () => {
    providerMocks.isChatProviderAvailable.mockResolvedValue(true);
    await expect(isLocalModelAvailable()).resolves.toBe(true);
  });

  it('validates empty, oversized and duplicate agent requests before provider calls', async () => {
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
    expect(providerMocks.generateChatCompletion).not.toHaveBeenCalled();
  });

  it('runs valid selected roles in parallel and returns each result', async () => {
    providerMocks.generateChatCompletion
      .mockResolvedValueOnce('First role response.')
      .mockResolvedValueOnce('Second role response.');

    const result = await orchestrateAgents([
      { agentId: 'data-ingestion', userMessage: 'Validate this fictional sample.' },
      { agentId: 'prudential-analysis', userMessage: 'Explain this synthetic ratio.' },
    ]);

    expect(result.success).toBe(true);
    expect(result.agents.map((agent) => agent.response)).toEqual([
      'First role response.',
      'Second role response.',
    ]);
    expect(providerMocks.generateChatCompletion).toHaveBeenCalledTimes(2);
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
    expect(report.checks.every((check) => check.status === 'passed')).toBe(true);
  });

  it('fails verification when an ungrounded citation is cited', () => {
    const report = verifySupervisoryOutput({
      intent: 'combined',
      retrievedSources: [{ id: 'DOC-1', title: 'Circular 10' }],
      citationsInResponse: ['S1', 'S99'],
    });

    expect(report.verified).toBe(false);
    const fidelityCheck = report.checks.find((check) => check.name === 'citation_fidelity');
    expect(fidelityCheck?.status).toBe('failed');
    expect(fidelityCheck?.detail).toContain('ungrounded');
  });

  it('fails verification when calculations contain out-of-bounds percentages', () => {
    const report = verifySupervisoryOutput({
      intent: 'analytical',
      analyticalResults: { nplRatioPercent: 5000 },
    });

    expect(report.verified).toBe(false);
    const calcCheck = report.checks.find((check) => check.name === 'calculation_sanity');
    expect(calcCheck?.status).toBe('failed');
  });
});

describe('executeSupervisoryWorkflow deterministic narratives', () => {
  it('executes portfolio analytics deterministically when the provider is offline', async () => {
    const result = await executeSupervisoryWorkflow(
      'Analyze portfolio deposits and NPL trends for 2026-10',
      { period: '2026-10' },
    );

    expect(result.intent).toBe('analytical');
    expect(result.scope.period).toBe('2026-10');
    expect(result.activeAgents).toContain('data-analyst');
    expect(result.verification.verified).toBe(true);
    expect(result.modelUsed).toBe('deterministic-fallback');
    expect(result.modelProvider).toBe('lmstudio');
    expect(result.contextUsed).toBe(true);
    expect(result.response.executiveSummary).toContain('Portfolio overview');
    expect(result.response.executiveSummary).toContain('31,400');
    expect(result.response.detail).toContain('loan');
    expect(result.response.facts.length).toBeGreaterThan(0);
    expect(result.response.facts.map((fact) => fact.label)).toContain('Loan-to-deposit ratio');
    expect(result.response.dataCards).toBeDefined();
    expect(result.response.disclaimer).toContain('Synthetic demonstration data');
    expect(JSON.stringify(result.response)).not.toContain('query processed');
  });

  it('computes institution-specific deltas, ratios and exception counts', async () => {
    const result = await executeSupervisoryWorkflow(
      'Analyze deposits and NPL for TZ004',
      { period: '2026-10' },
    );

    expect(result.intent).toBe('analytical');
    expect(result.scope.institutionName).toBe('Kilimanjaro Commercial Bank');
    expect(result.response.executiveSummary).toContain('Kilimanjaro Commercial Bank');
    expect(result.response.executiveSummary).toContain('4,200');
    expect(result.response.detail).toContain('Period-on-period changes');
    const labels = result.response.facts.map((fact) => fact.label);
    expect(labels).toContain('Deposits');
    expect(labels).toContain('Capital adequacy');
    expect(labels).toContain('NPL ratio');
    expect(labels).toContain('Loan-to-deposit ratio');
    expect(JSON.stringify(result.response)).not.toContain('query processed');
  });

  it('produces exception-specific counts, top signals and period ranges', async () => {
    const result = await executeSupervisoryWorkflow(
      'Investigate high-severity exceptions for TZ004',
    );

    expect(result.intent).toBe('exception_explanation');
    expect(result.response.executiveSummary).toContain('1 synthetic review signal');
    expect(result.response.detail).toContain('observed 6.8');
    expect(result.response.detail).toContain('5');
    const labels = result.response.facts.map((fact) => fact.label);
    expect(labels).toContain('Critical');
    expect(labels).toContain('Open');
    expect(labels).toContain('Top institution');
    expect(JSON.stringify(result.response)).not.toContain('query processed');
  });

  it('builds a report with aggregates, exception summary and top institutions', async () => {
    const result = await executeSupervisoryWorkflow(
      'Generate comprehensive supervisory report for 2026-10',
      { period: '2026-10' },
    );

    expect(result.intent).toBe('report');
    expect(result.response.executiveSummary).toContain('Supervisory summary report');
    expect(result.response.detail).toContain('Highest deposits');
    const labels = result.response.facts.map((fact) => fact.label);
    expect(labels).toContain('Top deposits');
    expect(labels).toContain('Top NPL ratios');
    expect(vi.mocked(listInstitutions)).toHaveBeenCalled();
  });

  it('extracts cited sentences for document and general questions', async () => {
    const result = await executeSupervisoryWorkflow(
      'What are the minimum capital adequacy requirements in regulatory circulars?',
    );

    expect(result.intent).toBe('document');
    expect(result.response.executiveSummary).toContain('Retrieved 1 synthetic source');
    expect(result.response.detail).toContain('[S1]');
    expect(result.response.detail).toContain('5%');
    expect(result.response.citations).toBeDefined();
  });

  it('executes combined queries with data and retrieved evidence citations', async () => {
    const result = await executeSupervisoryWorkflow(
      'Explain reporting rules and compliance status for TZ001',
    );

    expect(result.intent).toBe('combined');
    expect(result.activeAgents).toContain('data-analyst');
    expect(result.activeAgents).toContain('document-retrieval');
    expect(result.response.citations).toBeDefined();
    expect(result.response.detail).toContain('[S1]');
    expect(result.verification.verified).toBe(true);
  });
});

describe('executeSupervisoryWorkflow model enrichment', () => {
  it('accepts a grounded composer answer and records the Groq provider', async () => {
    providerMocks.isChatProviderAvailable.mockResolvedValue(true);
    providerMocks.getActiveChatProviderName.mockReturnValue('groq');
    providerMocks.generateChatCompletion.mockResolvedValue(
      'Executive summary for 2026-10: 14 institutions reported 31,400 TZS billion in deposits and 19,800 TZS billion in loans, with 3 open review signals and 1 critical signal.\n\nDetailed analysis confirms reporting completeness of 100% across 14 of 14 expected reports, with the NPL ratio and other training thresholds remaining review signals rather than official findings.',
    );

    const result = await executeSupervisoryWorkflow('Analyze portfolio deposits for 2026-10');

    expect(result.modelUsed).toBe('groq');
    expect(result.modelProvider).toBe('groq');
    expect(result.response.executiveSummary).toContain('Executive summary for 2026-10');
    expect(result.response.detail).toContain('Detailed analysis');
    const [messages] = providerMocks.generateChatCompletion.mock.calls[0];
    expect(messages[0].content).toContain('supplied synthetic aggregate facts');
    expect(messages[0].content).not.toContain('Live platform context');
    expect(messages[0].content).not.toContain('Kilimanjaro Commercial Bank');
    expect(messages[0].content).not.toContain('TZ004');
    expect(messages[0].content).not.toContain('DOC-01');
    expect(messages[1].content).toContain('Question: Analyze portfolio deposits');
    expect(messages[1].content).toContain('Analytical aggregate facts:');
    expect(messages[1].content).not.toContain('Evidence sources:');
    expect(messages[1].content).not.toContain('Kilimanjaro Commercial Bank');
    expect(messages[1].content).not.toContain('TZ004');
    expect(messages[1].content).not.toContain('DOC-01');
  });

  it('rejects generic model answers and keeps the deterministic narrative', async () => {
    providerMocks.isChatProviderAvailable.mockResolvedValue(true);
    providerMocks.generateChatCompletion.mockResolvedValue(
      "I don't have access to the requested data, so as an AI I cannot provide figures for the 14 synthetic institutions.",
    );

    const result = await executeSupervisoryWorkflow('Analyze portfolio deposits for 2026-10');

    expect(result.modelUsed).toBe('deterministic-fallback');
    expect(result.response.executiveSummary).not.toContain("I don't have access");
    expect(result.response.executiveSummary).toContain('Portfolio overview');
  });

  it('validates question length before execution', async () => {
    await expect(executeSupervisoryWorkflow('   ')).rejects.toThrow('between 2 and 2000 characters');
    await expect(executeSupervisoryWorkflow('a')).rejects.toThrow('between 2 and 2000 characters');
    await expect(executeSupervisoryWorkflow('x'.repeat(2001))).rejects.toThrow('between 2 and 2000 characters');
  });
});

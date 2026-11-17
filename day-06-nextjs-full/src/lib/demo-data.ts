export type DemoInstitution = {
  id: string;
  name: string;
  type:
    | 'Commercial Bank'
    | 'Microfinance Institution'
    | 'Development Finance Institution';
  region: string;
  tier: 'Tier 1' | 'Tier 2' | 'Tier 3';
  status: 'active' | 'monitoring';
  synthetic: true;
};

export type DemoReport = {
  id: string;
  institutionId: string;
  period: string;
  depositsTzsBillions: number;
  loansTzsBillions: number;
  capitalAdequacyRatioPercent: number;
  liquidityRatioPercent: number;
  nplRatioPercent: number;
  reportCompletenessPercent: number;
  lateSubmissionDays: number;
  recordsSubmitted: number;
  recordsRejected: number;
  sourceRecordIds: string[];
  submittedAtISO: string;
};

const institutions: DemoInstitution[] = [
  { id: 'TZ001', name: 'Bahari Meridian Bank', type: 'Commercial Bank', region: 'Dar es Salaam', tier: 'Tier 1', status: 'active', synthetic: true },
  { id: 'TZ002', name: 'Kivukoni Community Bank', type: 'Commercial Bank', region: 'Mwanza', tier: 'Tier 2', status: 'active', synthetic: true },
  { id: 'TZ003', name: 'Mlimani Savings Bank', type: 'Commercial Bank', region: 'Dodoma', tier: 'Tier 2', status: 'active', synthetic: true },
  { id: 'TZ004', name: 'Kipepeo Finance House', type: 'Commercial Bank', region: 'Arusha', tier: 'Tier 1', status: 'monitoring', synthetic: true },
  { id: 'TZ005', name: 'Nyota Development Finance', type: 'Development Finance Institution', region: 'Mbeya', tier: 'Tier 2', status: 'active', synthetic: true },
  { id: 'TZ006', name: 'Maji Cooperative Bank', type: 'Microfinance Institution', region: 'Morogoro', tier: 'Tier 3', status: 'active', synthetic: true },
  { id: 'TZ007', name: 'Savannah Gateway Bank', type: 'Commercial Bank', region: 'Tanga', tier: 'Tier 1', status: 'monitoring', synthetic: true },
  { id: 'TZ008', name: 'Lakeview Microfinance Network', type: 'Microfinance Institution', region: 'Zanzibar', tier: 'Tier 3', status: 'active', synthetic: true },
  { id: 'TZ009', name: 'Rift Valley Capital Bank', type: 'Commercial Bank', region: 'Iringa', tier: 'Tier 2', status: 'monitoring', synthetic: true },
  { id: 'TZ010', name: 'Ujamaa Development Bank', type: 'Development Finance Institution', region: 'Kilimanjaro', tier: 'Tier 2', status: 'active', synthetic: true },
  { id: 'TZ011', name: 'Coral Coast Finance Bank', type: 'Commercial Bank', region: 'Mtwara', tier: 'Tier 1', status: 'monitoring', synthetic: true },
  { id: 'TZ012', name: 'Highland Rural Finance', type: 'Microfinance Institution', region: 'Kigoma', tier: 'Tier 3', status: 'active', synthetic: true },
];

function round(value: number, digits = 2): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function monthPeriod(index: number): string {
  const date = new Date(Date.UTC(2024, 10 + index, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function buildReports(): DemoReport[] {
  return institutions.flatMap((institution, institutionIndex) => {
    const baseDeposits = 3.2 + ((institutionIndex * 17) % 29) * 0.74;
    const baseLoanShare = 0.58 + ((institutionIndex * 11) % 25) / 100;

    return Array.from({ length: 24 }, (_, monthIndex) => {
      const period = monthPeriod(monthIndex);
      const cycle = Math.sin((monthIndex + 1) * (institutionIndex + 2) * 0.37);
      const seasonal = Math.sin(((monthIndex % 12) / 12) * Math.PI * 2) * 0.009;
      const growth = (1 + monthIndex * (0.0045 + (institutionIndex % 4) * 0.0007)) *
        (1 + cycle * 0.018 + seasonal);
      let deposits = baseDeposits * growth;
      let loanShare = baseLoanShare + Math.sin((monthIndex + 2) * 0.29) * 0.035;

      if (institution.id === 'TZ004' && period === '2026-06') {
        deposits *= 0.76;
      }
      if (institution.id === 'TZ007' && monthIndex >= 20) {
        loanShare += 0.28;
      }

      const capital = 13.2 + ((institutionIndex * 7) % 90) / 10 +
        Math.sin((monthIndex + institutionIndex) * 0.23) * 0.65;
      const liquidity = 112 + ((institutionIndex * 13) % 75) +
        Math.cos((monthIndex + institutionIndex) * 0.31) * 8;
      const npl = 2.1 + ((institutionIndex * 9) % 37) / 10 +
        Math.sin((monthIndex + institutionIndex) * 0.17) * 0.45;
      const completeness = 96 + ((institutionIndex * 5 + monthIndex * 3) % 5) -
        (institution.status === 'monitoring' && monthIndex > 19 ? 3 : 0);

      const anomalyCapital = institution.id === 'TZ004' && period === '2026-10';
      const anomalyNpl = institution.id === 'TZ009' && period === '2026-08';
      const anomalyLiquidity = institution.id === 'TZ012' && period === '2026-09';
      const anomalyCompleteness = institution.id === 'TZ011' && monthIndex >= 21;
      const anomalyRejections = institution.id === 'TZ005' && period === '2026-04';
      const lateDays = (institutionIndex * 3 + monthIndex * 5) % 8;
      const recordsSubmitted = 680 + ((institutionIndex * 263 + monthIndex * 47) % 3600);
      const recordsRejected = anomalyRejections
        ? 28
        : (institutionIndex + monthIndex * 2) % 9;
      const year = Number(period.slice(0, 4));
      const month = Number(period.slice(5, 7));
      const submittedAt = new Date(Date.UTC(year, month, 5 + (institutionIndex % 4)));
      const id = `RPT-${institution.id}-${period}`;

      return {
        id,
        institutionId: institution.id,
        period,
        depositsTzsBillions: round(deposits),
        loansTzsBillions: round(deposits * loanShare),
        capitalAdequacyRatioPercent: round(anomalyCapital ? 9.4 : capital),
        liquidityRatioPercent: round(anomalyLiquidity ? 88 : liquidity),
        nplRatioPercent: round(anomalyNpl ? 10.2 : npl),
        reportCompletenessPercent: round(
          anomalyCompleteness ? Math.max(79, completeness - 10) : completeness,
        ),
        lateSubmissionDays: lateDays,
        recordsSubmitted,
        recordsRejected,
        sourceRecordIds: [`SRC-${institution.id}-${period}-001`],
        submittedAtISO: submittedAt.toISOString(),
      };
    });
  });
}

export function buildDemoData(): {
  institutions: DemoInstitution[];
  reports: DemoReport[];
} {
  return {
    institutions: institutions.map((institution) => ({ ...institution })),
    reports: buildReports(),
  };
}

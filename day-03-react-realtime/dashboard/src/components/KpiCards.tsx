import { formatPercent, formatRatio, formatTZS } from '../format';
import type { SectorSummary } from '../types';

export interface KpiCardsProps {
  summary: SectorSummary | null;
}

interface Card {
  label: string;
  value: string;
  detail: string;
}

function cardsFrom(summary: SectorSummary | null): Card[] {
  if (!summary) {
    return [];
  }
  return [
    {
      label: 'Sector deposits',
      value: formatTZS(summary.sector_total_deposits),
      detail: 'Total deposits reported for the period',
    },
    {
      label: 'Sector loans',
      value: formatTZS(summary.sector_total_loans),
      detail: 'Total loans and advances reported for the period',
    },
    {
      label: 'Loan to deposit ratio',
      value: formatRatio(summary.sector_loan_to_deposit_ratio),
      detail: 'Sector loans as a share of sector deposits',
    },
    {
      label: 'Deposit concentration',
      value:
        summary.sector_deposit_concentration_hhi === undefined ||
        summary.sector_deposit_concentration_hhi === null
          ? '—'
          : summary.sector_deposit_concentration_hhi.toFixed(0),
      detail: 'Herfindahl-Hirschman index of sector deposits',
    },
    {
      label: 'Reporting coverage',
      value: formatPercent(summary.sector_reporting_coverage_ratio),
      detail: `${summary.institutions_reporting ?? 0} of ${
        summary.institutions_expected ?? 0
      } expected institutions reported`,
    },
    {
      label: 'Watchlist exposure',
      value:
        summary.sector_watchlist_exposure_count === undefined ||
        summary.sector_watchlist_exposure_count === null
          ? '—'
          : String(summary.sector_watchlist_exposure_count),
      detail: 'Curated records from institutions under enhanced monitoring',
    },
    {
      label: 'Exceptions',
      value: String(summary.exceptions ?? 0),
      detail: `${summary.critical_exceptions ?? 0} critical, ${
        summary.high_exceptions ?? 0
      } high, ${summary.medium_exceptions ?? 0} medium`,
    },
    {
      label: 'Institutions missing',
      value: String(summary.institutions_missing ?? 0),
      detail: 'Expected reporters that did not file a curated record',
    },
  ];
}

/** The sector picture, as a row of cards. */
export function KpiCards({ summary }: KpiCardsProps) {
  const cards = cardsFrom(summary);
  if (cards.length === 0) {
    return null;
  }
  return (
    <section className="kpi-grid" aria-label="Sector indicators">
      {cards.map((card) => (
        <article className="kpi-card" key={card.label}>
          <h3 className="kpi-card__label">{card.label}</h3>
          <p className="kpi-card__value">{card.value}</p>
          <p className="kpi-card__detail">{card.detail}</p>
        </article>
      ))}
    </section>
  );
}

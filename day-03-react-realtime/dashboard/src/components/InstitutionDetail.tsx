import { useEffect, useState } from 'react';

import { api } from '../api';
import { formatIndicator } from '../format';
import type { InstitutionDetail as InstitutionDetailData } from '../types';

export interface InstitutionDetailProps {
  institutionId: string;
  onClose: () => void;
}

/**
 * One institution: its register details, its indicators and its exceptions.
 *
 * The indicators carry the calculation basis, so a number on this panel can
 * be traced back to the records it came from without leaving the screen.
 */
export function InstitutionDetail({
  institutionId,
  onClose,
}: InstitutionDetailProps) {
  const [detail, setDetail] = useState<InstitutionDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    api
      .institution(institutionId)
      .then((result) => {
        if (!cancelled) {
          setDetail(result);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : 'the institution could not be loaded',
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [institutionId]);

  return (
    <aside className="detail" aria-label="Institution detail">
      <header className="detail__header">
        <div>
          <h3>{institutionId}</h3>
          {detail ? (
            <p className="detail__identifier">{detail.institution_name}</p>
          ) : null}
        </div>
        <button
          type="button"
          className="detail__close"
          onClick={onClose}
          aria-label="Close the institution detail"
        >
          ×
        </button>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {!detail && !error ? <p className="empty">Loading…</p> : null}

      {detail ? (
        <>
          <dl className="detail__facts">
            <div>
              <dt>Type</dt>
              <dd>{detail.institution_type ?? '—'}</dd>
            </div>
            <div>
              <dt>Licence</dt>
              <dd>{detail.licence_status ?? '—'}</dd>
            </div>
            <div>
              <dt>Region</dt>
              <dd>{detail.region ?? '—'}</dd>
            </div>
            <div>
              <dt>Cadence</dt>
              <dd>{detail.reporting_frequency ?? '—'}</dd>
            </div>
          </dl>

          <section>
            <h4>Indicators</h4>
            <ul className="indicator-list">
              {detail.indicators.map((indicator) => (
                <li
                  className="indicator-list__item"
                  key={`${indicator.indicator_id}-${indicator.reporting_period}`}
                >
                  <div className="indicator-list__head">
                    <span>{indicator.indicator_name}</span>
                    <span className="numeric">
                      {formatIndicator(indicator)}
                    </span>
                  </div>
                  <p className="indicator-list__basis">
                    {indicator.calculation_basis}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h4>Exceptions</h4>
            {detail.exceptions.length === 0 ? (
              <p className="empty">
                This institution raises no exception in the current period.
              </p>
            ) : (
              <ul className="audit-list">
                {detail.exceptions.map((exception) => (
                  <li
                    key={exception.exception_id}
                    className="audit-list__item audit-list__item--context"
                  >
                    <div className="audit-list__head">
                      <span
                        className={`severity severity--${exception.severity.toLowerCase()}`}
                      >
                        {exception.severity}
                      </span>
                      <span className="audit-list__rule">
                        {exception.exception_id}
                      </span>
                    </div>
                    <p className="audit-list__detail">{exception.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </aside>
  );
}

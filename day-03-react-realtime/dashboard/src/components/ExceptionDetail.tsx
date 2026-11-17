import { useEffect, useState } from 'react';

import { api } from '../api';
import type { SupervisoryException } from '../types';

export interface ExceptionDetailProps {
  exception: SupervisoryException;
  onClose: () => void;
}

/**
 * The drill-down: one exception and everything that explains it.
 *
 * The panel holds the threshold evidence, the reason a supervisor would
 * give, and the data quality findings that are attached to the subject.
 * A finding is either the cause of the exception or context for it, and
 * the panel says which.
 */
export function ExceptionDetail({
  exception,
  onClose,
}: ExceptionDetailProps) {
  const [detail, setDetail] = useState<SupervisoryException>(exception);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetail(exception);
    setError(null);
    api
      .exceptionDetail(exception.exception_id)
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
              : 'the exception could not be loaded',
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [exception]);

  const entries = detail.audit_entries ?? [];

  return (
    <aside className="detail" aria-label="Exception detail">
      <header className="detail__header">
        <div>
          <span className={`severity severity--${detail.severity.toLowerCase()}`}>
            {detail.severity}
          </span>
          <h3>{detail.message}</h3>
          <p className="detail__identifier">{detail.exception_id}</p>
        </div>
        <button
          type="button"
          className="detail__close"
          onClick={onClose}
          aria-label="Close the exception detail"
        >
          ×
        </button>
      </header>

      <dl className="detail__facts">
        <div>
          <dt>Subject</dt>
          <dd>{detail.subject_id}</dd>
        </div>
        <div>
          <dt>Observed</dt>
          <dd>
            {detail.observed_value_text} {detail.indicator_name}
          </dd>
        </div>
        <div>
          <dt>Limit</dt>
          <dd>{detail.limit_description}</dd>
        </div>
        <div>
          <dt>Threshold</dt>
          <dd>
            {detail.threshold_id} {detail.threshold_name}
          </dd>
        </div>
        <div>
          <dt>Reporting period</dt>
          <dd>{detail.reporting_period}</dd>
        </div>
        <div>
          <dt>Source row</dt>
          <dd>{detail.source_row_number ?? 'sector level'}</dd>
        </div>
      </dl>

      <section>
        <h4>Why it matters</h4>
        <p className="detail__explanation">{detail.explanation}</p>
      </section>

      <section>
        <h4>Data quality findings</h4>
        {error ? <p className="error">{error}</p> : null}
        {entries.length === 0 && !error ? (
          <p className="empty">
            No finding is attached to this subject. The record behind it was
            admitted to the curated layer without a warning.
          </p>
        ) : null}
        <ul className="audit-list">
          {entries.map((entry) => (
            <li
              key={`${entry.source_row_number}-${entry.rule_id}`}
              className={`audit-list__item audit-list__item--${entry.relation}`}
            >
              <div className="audit-list__head">
                <span className="audit-list__rule">
                  {entry.rule_id} {entry.rule_name}
                </span>
                <span className="audit-list__relation">{entry.relation}</span>
              </div>
              <p className="audit-list__detail">{entry.detail}</p>
              <p className="audit-list__source">
                source row {entry.source_row_number}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}

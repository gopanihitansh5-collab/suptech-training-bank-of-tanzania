import type { SupervisoryException } from '../types';

export interface ExceptionsTableProps {
  exceptions: SupervisoryException[];
  selectedId?: string | null;
  onSelect: (exception: SupervisoryException) => void;
}

/**
 * The exceptions, most urgent first.
 *
 * Every row carries the observed value and the limit it breached, because
 * a number without its limit is not a finding. Clicking a row opens the
 * detail, which is where the reason behind it lives.
 */
export function ExceptionsTable({
  exceptions,
  selectedId,
  onSelect,
}: ExceptionsTableProps) {
  if (exceptions.length === 0) {
    return (
      <p className="empty">No exception matches the current filters.</p>
    );
  }
  return (
    <div className="table-scroll">
      <table className="data-table">
        <caption className="visually-hidden">
          Supervisory exceptions, most urgent first
        </caption>
        <thead>
          <tr>
            <th scope="col">Severity</th>
            <th scope="col">Subject</th>
            <th scope="col">Indicator</th>
            <th scope="col">Observed</th>
            <th scope="col">Limit</th>
            <th scope="col">Period</th>
          </tr>
        </thead>
        <tbody>
          {exceptions.map((exception) => (
            <tr
              key={exception.exception_id}
              className={
                exception.exception_id === selectedId
                  ? 'data-table__row data-table__row--selected'
                  : 'data-table__row'
              }
              onClick={() => onSelect(exception)}
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(exception);
                }
              }}
            >
              <td>
                <span
                  className={`severity severity--${exception.severity.toLowerCase()}`}
                >
                  {exception.severity}
                </span>
              </td>
              <td>{exception.subject_id}</td>
              <td>
                {exception.indicator_name}
                <span className="cell-subtitle">{exception.threshold_id}</span>
              </td>
              <td className="numeric">{exception.observed_value_text}</td>
              <td>{exception.limit_description}</td>
              <td>{exception.reporting_period}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

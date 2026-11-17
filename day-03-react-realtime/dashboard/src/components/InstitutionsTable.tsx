import type { Institution } from '../types';

export interface InstitutionsTableProps {
  institutions: Institution[];
  selectedId?: string | null;
  onSelect: (institution: Institution) => void;
}

/** The supervised register, with the exception count of each institution. */
export function InstitutionsTable({
  institutions,
  selectedId,
  onSelect,
}: InstitutionsTableProps) {
  if (institutions.length === 0) {
    return <p className="empty">The register is empty.</p>;
  }
  return (
    <div className="table-scroll">
      <table className="data-table">
        <caption className="visually-hidden">Supervised institutions</caption>
        <thead>
          <tr>
            <th scope="col">Identifier</th>
            <th scope="col">Name</th>
            <th scope="col">Type</th>
            <th scope="col">Region</th>
            <th scope="col">Cadence</th>
            <th scope="col">Watchlist</th>
            <th scope="col">Exceptions</th>
          </tr>
        </thead>
        <tbody>
          {institutions.map((institution) => (
            <tr
              key={institution.institution_id}
              className={
                institution.institution_id === selectedId
                  ? 'data-table__row data-table__row--selected'
                  : 'data-table__row'
              }
              onClick={() => onSelect(institution)}
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(institution);
                }
              }}
            >
              <td>{institution.institution_id}</td>
              <td>{institution.institution_name}</td>
              <td>{institution.institution_type ?? '—'}</td>
              <td>{institution.region ?? '—'}</td>
              <td>{institution.reporting_frequency ?? '—'}</td>
              <td>
                {String(institution.watchlist_flag).toLowerCase() === 'true' ? (
                  <span className="watchlist">watchlist</span>
                ) : (
                  '—'
                )}
              </td>
              <td className="numeric">
                {institution.exceptions ?? 0}
                {institution.critical_exceptions ? (
                  <span className="cell-subtitle cell-subtitle--critical">
                    {institution.critical_exceptions} critical
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import { SEVERITY_ORDER } from '../format';

export interface FiltersProps {
  periods: string[];
  reportingPeriod: string;
  severity: string;
  institution: string;
  onChange: (next: {
    reportingPeriod: string;
    severity: string;
    institution: string;
  }) => void;
}

/** The filters: which period, which severity, which institution. */
export function Filters({
  periods,
  reportingPeriod,
  severity,
  institution,
  onChange,
}: FiltersProps) {
  return (
    <section className="filters" aria-label="Filters">
      <label className="filters__field">
        <span>Reporting period</span>
        <select
          value={reportingPeriod}
          onChange={(event) =>
            onChange({
              reportingPeriod: event.target.value,
              severity,
              institution,
            })
          }
        >
          <option value="">Every period</option>
          {periods.map((period) => (
            <option key={period} value={period}>
              {period}
            </option>
          ))}
        </select>
      </label>

      <label className="filters__field">
        <span>Severity</span>
        <select
          value={severity}
          onChange={(event) =>
            onChange({ reportingPeriod, severity: event.target.value, institution })
          }
        >
          <option value="">Every severity</option>
          {SEVERITY_ORDER.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>

      <label className="filters__field filters__field--grow">
        <span>Institution</span>
        <input
          type="search"
          value={institution}
          placeholder="An institution identifier"
          onChange={(event) =>
            onChange({ reportingPeriod, severity, institution: event.target.value })
          }
        />
      </label>
    </section>
  );
}

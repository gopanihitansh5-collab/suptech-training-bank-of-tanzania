import Link from 'next/link';
import type { Page, ReportRow } from '@/lib/repository';
import { SelectableTable } from './selectable-table';

export function ReportTable({
  result,
  filters,
}: {
  result: Page<ReportRow>;
  filters: { search?: string; institutionId?: string; period?: string };
}) {
  const pageHref = (page: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, value);
    }
    params.set('page', String(page));
    return `?${params}`;
  };

  return (
    <>
      {result.items.length ? (
        <SelectableTable>
          <table>
            <thead>
              <tr>
                <th>Reporting period</th>
                <th>Institution</th>
                <th>Source report</th>
                <th>Submitted</th>
                <th>Completeness</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((report) => (
                <tr key={report.reportId}>
                  <td className="mono">{report.period}</td>
                  <td>
                    <Link
                      className="table-link institution-name"
                      href={`/institutions/${encodeURIComponent(report.institutionId)}`}
                    >
                      {report.institutionName}
                    </Link>
                    <div className="mono" style={{ marginTop: 4, color: '#758197', fontSize: 10 }}>
                      {report.institutionId}
                    </div>
                  </td>
                  <td className="mono">{report.reportId}</td>
                  <td>{new Date(report.submittedAt).toLocaleDateString('en')}</td>
                  <td className="mono">{report.completenessPercent.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SelectableTable>
      ) : (
        <div className="empty-state" role="status">No reports match these filters.</div>
      )}
      <div className="pagination">
        <span>Page {result.page} of {Math.max(result.totalPages, 1)} · {result.total} reports</span>
        <div className="pagination-links">
          {result.page > 1
            ? <Link href={pageHref(result.page - 1)}>Previous</Link>
            : <span className="disabled" aria-disabled="true">Previous</span>}
          {result.page < result.totalPages
            ? <Link href={pageHref(result.page + 1)}>Next</Link>
            : <span className="disabled" aria-disabled="true">Next</span>}
        </div>
      </div>
    </>
  );
}

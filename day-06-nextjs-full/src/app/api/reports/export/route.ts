import { errorResponse } from '@/lib/api-errors';
import { requireDemoSession } from '@/lib/auth';
import { csvResponse } from '@/lib/csv';
import { buildReportExport } from '@/lib/reports-export';

export async function GET(request: Request) {
  try {
    const session = await requireDemoSession();
    const params = new URL(request.url).searchParams;
    const result = await buildReportExport(
      {
        search: params.get('search') ?? undefined,
        institutionId: params.get('institutionId') ?? undefined,
        period: params.get('period') ?? undefined,
      },
      undefined,
      session.userId,
    );
    const body = result.truncated
      ? `${result.csv}# truncated at 1000 rows\r\n`
      : result.csv;
    const filename = `day6-reports-${new Date().toISOString().slice(0, 10)}.csv`;
    return csvResponse(filename, body);
  } catch (error) {
    return errorResponse(error);
  }
}

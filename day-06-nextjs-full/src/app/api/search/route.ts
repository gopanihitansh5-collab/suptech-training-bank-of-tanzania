import { NextResponse } from 'next/server';
import { RequestValidationError, errorResponse } from '@/lib/api-errors';
import { requireDemoSession } from '@/lib/auth';
import { searchAll } from '@/lib/search';

function optionalInteger(value: string | null): number | undefined {
  if (value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

export async function GET(request: Request) {
  try {
    await requireDemoSession();
    const params = new URL(request.url).searchParams;
    const query = params.get('q')?.trim() ?? '';
    const limit = optionalInteger(params.get('limit'));
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 25)) {
      throw new RequestValidationError('Limit must be between 1 and 25.');
    }

    const hits = await searchAll(query, { limit });

    return NextResponse.json({
      query,
      hits,
      counts: {
        documents: hits.filter((hit) => hit.kind === 'document').length,
        reports: hits.filter((hit) => hit.kind === 'report').length,
        institutions: hits.filter((hit) => hit.kind === 'institution').length,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

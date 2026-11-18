import { NextResponse } from 'next/server';
import { RequestValidationError, errorResponse } from '@/lib/api-errors';
import { requireDemoSession } from '@/lib/auth';
import { searchGroundedEvidence } from '@/lib/grounded-retrieval';
import type { SearchHit } from '@/lib/search';

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
    const period = params.get('period')?.trim() || undefined;
    const institutionId = params.get('institutionId')?.trim() || undefined;
    const kindValue = params.get('kind')?.trim() || '';
    const kind = ['document', 'report', 'institution', 'exception']
      .find((value): value is SearchHit['kind'] => value === kindValue);
    if (kindValue && !kind) {
      throw new RequestValidationError('Evidence type is not supported.');
    }
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 25)) {
      throw new RequestValidationError('Limit must be between 1 and 25.');
    }

    const retrieval = await searchGroundedEvidence(query, {
      limit,
      period,
      institutionId,
      kind,
    });
    const { hits } = retrieval;

    return NextResponse.json({
      query,
      retrievalMode: retrieval.mode,
      ...(retrieval.fallbackReason ? { fallbackReason: retrieval.fallbackReason } : {}),
      hits,
      counts: {
        documents: hits.filter((hit) => hit.kind === 'document').length,
        reports: hits.filter((hit) => hit.kind === 'report').length,
        institutions: hits.filter((hit) => hit.kind === 'institution').length,
        exceptions: hits.filter((hit) => hit.kind === 'exception').length,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

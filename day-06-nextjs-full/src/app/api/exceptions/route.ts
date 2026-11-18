import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api-errors';
import { requireDemoSession } from '@/lib/auth';
import { listExceptions } from '@/lib/repository';

function optionalInteger(value: string | null): number | undefined {
  if (value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

export async function GET(request: Request) {
  try {
    await requireDemoSession();
    const params = new URL(request.url).searchParams;
    return NextResponse.json(await listExceptions({
      search: params.get('search') ?? undefined,
      institutionId: params.get('institutionId') ?? undefined,
      period: params.get('period') ?? undefined,
      severity: params.get('severity') ?? undefined,
      status: params.get('status') ?? undefined,
      page: optionalInteger(params.get('page')),
      pageSize: optionalInteger(params.get('pageSize')),
    }));
  } catch (error) {
    return errorResponse(error);
  }
}

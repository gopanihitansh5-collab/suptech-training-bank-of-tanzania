import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api-errors';
import { requireDemoSession } from '@/lib/auth';
import { getAnalytics } from '@/lib/repository';

export async function GET(request: Request) {
  try {
    await requireDemoSession();
    const params = new URL(request.url).searchParams;
    return NextResponse.json(await getAnalytics(
      params.get('period') ?? undefined,
      params.get('indicator') ?? undefined,
    ));
  } catch (error) {
    return errorResponse(error);
  }
}

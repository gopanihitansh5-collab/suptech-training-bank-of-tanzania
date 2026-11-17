import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api-errors';
import { requireDemoSession } from '@/lib/auth';
import { getOverview } from '@/lib/repository';

export async function GET(request: Request) {
  try {
    await requireDemoSession();
    const period = new URL(request.url).searchParams.get('period') ?? undefined;
    return NextResponse.json(await getOverview(period));
  } catch (error) {
    return errorResponse(error);
  }
}

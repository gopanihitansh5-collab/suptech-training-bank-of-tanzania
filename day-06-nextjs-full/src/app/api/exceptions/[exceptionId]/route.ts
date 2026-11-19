import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api-errors';
import { requireDemoSession } from '@/lib/auth';
import { getExceptionById } from '@/lib/repository';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ exceptionId: string }> },
) {
  try {
    await requireDemoSession();
    const { exceptionId } = await params;
    const exception = await getExceptionById(exceptionId);
    return NextResponse.json({ exception });
  } catch (error) {
    return errorResponse(error);
  }
}

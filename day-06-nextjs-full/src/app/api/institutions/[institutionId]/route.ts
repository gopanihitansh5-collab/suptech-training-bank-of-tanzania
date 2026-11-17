import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api-errors';
import { requireDemoSession } from '@/lib/auth';
import { getInstitutionDetail } from '@/lib/repository';

export async function GET(
  _request: Request,
  context: { params: Promise<{ institutionId: string }> },
) {
  try {
    await requireDemoSession();
    const { institutionId } = await context.params;
    return NextResponse.json(await getInstitutionDetail(institutionId));
  } catch (error) {
    return errorResponse(error);
  }
}

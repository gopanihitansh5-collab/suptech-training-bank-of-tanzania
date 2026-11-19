import { NextResponse } from 'next/server';
import { errorResponse, readJsonBody, RequestValidationError } from '@/lib/api-errors';
import { requireDemoSession } from '@/lib/auth';
import { listExceptions, updateExceptionStatus } from '@/lib/repository';

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

/** PATCH /api/exceptions — triage an exception (change status). Requires supervisor or admin. */
export async function PATCH(request: Request) {
  try {
    const session = await requireDemoSession(['supervisor', 'admin']);
    const body = await readJsonBody(request, 4000);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new RequestValidationError('Request body must be an object.');
    }
    const rec = body as Record<string, unknown>;
    const exceptionId = typeof rec.exceptionId === 'string' ? rec.exceptionId.trim() : '';
    if (!exceptionId) throw new RequestValidationError('exceptionId is required.');
    const newStatus = rec.status;
    if (newStatus !== 'open' && newStatus !== 'under_review' && newStatus !== 'resolved') {
      throw new RequestValidationError('status must be open, under_review, or resolved.');
    }
    const note = typeof rec.note === 'string' ? rec.note.trim().slice(0, 500) : undefined;
    const updated = await updateExceptionStatus(exceptionId, newStatus, session.userId, note);
    return NextResponse.json({ exception: updated });
  } catch (error) {
    return errorResponse(error);
  }
}

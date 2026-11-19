import { NextResponse } from 'next/server';
import { errorResponse, readJsonBody, RequestValidationError } from '@/lib/api-errors';
import { requireDemoSession } from '@/lib/auth';
import { createConversation, listConversations } from '@/lib/repository';

/** GET /api/conversations — list this user's saved conversations */
export async function GET() {
  try {
    const session = await requireDemoSession();
    const conversations = await listConversations(session.userId);
    return NextResponse.json({ conversations });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST /api/conversations — start a new persisted conversation */
export async function POST(request: Request) {
  try {
    const session = await requireDemoSession();
    const body = await readJsonBody(request, 4000);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new RequestValidationError('Request body must be an object.');
    }
    const rec = body as Record<string, unknown>;
    const title = typeof rec.title === 'string' ? rec.title.trim().slice(0, 200) : 'Untitled conversation';
    const activeFilters =
      rec.activeFilters && typeof rec.activeFilters === 'object' && !Array.isArray(rec.activeFilters)
        ? rec.activeFilters as Record<string, unknown>
        : {};
    const conversationId = await createConversation(session.userId, title, activeFilters);
    return NextResponse.json({ conversationId }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

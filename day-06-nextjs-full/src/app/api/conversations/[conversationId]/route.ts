import { NextResponse } from 'next/server';
import { errorResponse, readJsonBody, RequestValidationError } from '@/lib/api-errors';
import { requireDemoSession } from '@/lib/auth';
import { appendMessage, getConversationMessages } from '@/lib/repository';

type Ctx = { params: Promise<{ conversationId: string }> };

/** GET /api/conversations/[conversationId] — fetch messages for a conversation */
export async function GET(_request: Request, { params }: Ctx) {
  try {
    const session = await requireDemoSession();
    const { conversationId } = await params;
    const messages = await getConversationMessages(conversationId, session.userId);
    return NextResponse.json({ messages });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST /api/conversations/[conversationId] — append a message to a conversation */
export async function POST(request: Request, { params }: Ctx) {
  try {
    const session = await requireDemoSession();
    const { conversationId } = await params;
    const body = await readJsonBody(request, 64_000);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new RequestValidationError('Request body must be an object.');
    }
    const rec = body as Record<string, unknown>;
    const role = rec.role;
    if (role !== 'user' && role !== 'assistant' && role !== 'tool') {
      throw new RequestValidationError('role must be user, assistant, or tool.');
    }
    if (typeof rec.content !== 'string' || rec.content.trim().length < 1) {
      throw new RequestValidationError('content is required.');
    }
    const evidence = Array.isArray(rec.evidence) ? rec.evidence : [];
    // getConversationMessages will throw NotFoundError / 403 if wrong user
    await getConversationMessages(conversationId, session.userId);
    await appendMessage(conversationId, role, rec.content, evidence);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

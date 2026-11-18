import { NextResponse } from 'next/server';
import { errorResponse, readJsonBody, RequestValidationError } from '@/lib/api-errors';
import { requireDemoSession } from '@/lib/auth';
import { planAssistantQuestion } from '@/lib/assistant-planner';

export async function POST(request: Request) {
  try {
    await requireDemoSession();
    const body = await readJsonBody(request, 8000);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new RequestValidationError('The request body must be an object.');
    }
    const question = 'question' in body ? body.question : undefined;
    if (typeof question !== 'string') {
      throw new RequestValidationError('Question must be a string.');
    }
    return NextResponse.json({ plan: planAssistantQuestion(question) });
  } catch (error) {
    return errorResponse(error);
  }
}

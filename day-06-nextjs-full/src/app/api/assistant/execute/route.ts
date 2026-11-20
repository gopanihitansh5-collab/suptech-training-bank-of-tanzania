import { NextResponse } from 'next/server';
import { errorResponse, readJsonBody, RequestValidationError } from '@/lib/api-errors';
import { requireDemoSession } from '@/lib/auth';
import { runTool } from '@/lib/assistant-tools';

export async function POST(request: Request) {
  try {
    await requireDemoSession();
    const body = await readJsonBody(request, 8000);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new RequestValidationError('The request body must be an object.');
    }
    const tool = 'tool' in body ? body.tool : undefined;
    const args = 'arguments' in body ? body.arguments : undefined;
    const question = 'question' in body ? body.question : undefined;
    if (typeof tool !== 'string') {
      throw new RequestValidationError('A planned read-only operation is required.');
    }
    const result = await runTool(
      tool,
      args,
      typeof question === 'string' ? question : undefined,
    );
    return NextResponse.json({ result });
  } catch (error) {
    return errorResponse(error);
  }
}

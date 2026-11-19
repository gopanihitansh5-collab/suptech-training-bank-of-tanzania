import { NextResponse } from 'next/server';
import { errorResponse, RequestValidationError } from '@/lib/api-errors';
import { requireDemoSession } from '@/lib/auth';
import { buildAssistantSuggestions } from '@/lib/assistant-suggestions';

export async function GET(request: Request) {
  try {
    await requireDemoSession();
    const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
    if (query.length > 100) {
      throw new RequestValidationError('Suggestion query must be 100 characters or fewer.');
    }
    const suggestions = await buildAssistantSuggestions(query || undefined);
    return NextResponse.json(suggestions, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

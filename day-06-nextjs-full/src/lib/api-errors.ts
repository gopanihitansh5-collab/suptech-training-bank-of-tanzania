import { NextResponse } from 'next/server';
import { AuthConfigurationError, AuthError } from './auth';

export class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RequestValidationError';
  }
}

export class PayloadTooLargeError extends Error {
  constructor() {
    super('The request is too large.');
    this.name = 'PayloadTooLargeError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof AuthConfigurationError) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }
  if (error instanceof RequestValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof PayloadTooLargeError) {
    return NextResponse.json({ error: error.message }, { status: 413 });
  }
  if (error instanceof NotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  const errorCode =
    error && typeof error === 'object' && 'code' in error &&
    typeof error.code === 'string'
      ? error.code
      : 'internal_error';
  console.error('Day 6 API request failed', { errorCode });
  return NextResponse.json(
    { error: 'The request could not be completed. Check the local service status and retry.' },
    { status: 500 },
  );
}

export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null) {
    const declaredLength = Number(contentLength);
    if (!Number.isSafeInteger(declaredLength) || declaredLength < 0) {
      throw new RequestValidationError('The request content length is invalid.');
    }
    if (declaredLength > maxBytes) {
      throw new PayloadTooLargeError();
    }
  }

  const reader = request.body?.getReader();
  if (!reader) {
    throw new RequestValidationError('The request body must be valid JSON.');
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new PayloadTooLargeError();
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new RequestValidationError('The request body must be valid JSON.');
  }
}

import { describe, expect, it } from 'vitest';
import { errorResponse, PayloadTooLargeError, readJsonBody } from './api-errors';

describe('readJsonBody', () => {
  it('parses valid JSON within the byte limit', async () => {
    const request = new Request('http://localhost/api', {
      method: 'POST',
      body: JSON.stringify({ question: 'show overview' }),
    });

    await expect(readJsonBody(request, 100)).resolves.toEqual({
      question: 'show overview',
    });
  });

  it('enforces the byte limit when content length is absent', async () => {
    const request = new Request('http://localhost/api', {
      method: 'POST',
      body: JSON.stringify({ question: 'x'.repeat(100) }),
    });

    await expect(readJsonBody(request, 20)).rejects.toBeInstanceOf(PayloadTooLargeError);
    const response = errorResponse(new PayloadTooLargeError());
    expect(response.status).toBe(413);
  });

  it('rejects malformed JSON', async () => {
    const request = new Request('http://localhost/api', {
      method: 'POST',
      body: '{',
    });

    await expect(readJsonBody(request, 20)).rejects.toThrow('valid JSON');
  });
});

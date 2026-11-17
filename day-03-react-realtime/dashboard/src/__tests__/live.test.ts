import { describe, expect, it, vi } from 'vitest';

import { createLiveClient, createSseParser } from '../live';
import type { LiveEvent, LiveStatus } from '../live';

function frame(id: number | null, type: string, data: unknown): string {
  const lines = [
    ...(id === null ? [] : [`id: ${id}`]),
    `event: ${type}`,
    `data: ${JSON.stringify(data)}`,
    '',
    '',
  ];
  return lines.join('\n');
}

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
}

describe('the Server-Sent Events parser', () => {
  it('reads an event that arrives in one piece', () => {
    const received: LiveEvent[] = [];
    const parser = createSseParser((event) => received.push(event));

    parser.push(frame(7, 'run.available', { run_id: 'abc' }));

    expect(received).toHaveLength(1);
    expect(received[0].id).toBe(7);
    expect(received[0].type).toBe('run.available');
    expect(received[0].data).toEqual({ run_id: 'abc' });
  });

  it('reads an event that arrives in pieces', () => {
    const received: LiveEvent[] = [];
    const parser = createSseParser((event) => received.push(event));

    parser.push('id: 3\nevent: run.');
    parser.push('available\ndata: {"run_id":"x"}\n');
    parser.push('\n');

    expect(received).toHaveLength(1);
    expect(received[0].id).toBe(3);
    expect(received[0].type).toBe('run.available');
  });

  it('ignores a keep-alive comment', () => {
    const received: LiveEvent[] = [];
    const parser = createSseParser((event) => received.push(event));

    parser.push(': keep-alive\n\n');

    expect(received).toHaveLength(0);
  });

  it('keeps a frame that is not JSON as the text it arrived as', () => {
    const received: LiveEvent[] = [];
    const parser = createSseParser((event) => received.push(event));

    parser.push('event: note\ndata: not json\n\n');

    expect(received[0].data).toBe('not json');
  });
});

describe('the live client', () => {
  it('reports the connection states as it goes', async () => {
    const statuses: LiveStatus[] = [];
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: streamOf([frame(1, 'run.available', { run_id: 'abc' })]),
    });

    const client = createLiveClient({
      token: 'a-token',
      url: '/api/v1/events',
      onEvent: () => {},
      onStatus: (status) => statuses.push(status),
      fetchImpl: fetchImpl as never,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      baseBackoffMs: 5,
      maxBackoffMs: 20,
    });

    client.start();
    await vi.waitFor(() => expect(statuses).toContain('live'));
    client.stop();

    expect(statuses[0]).toBe('connecting');
    expect(statuses).toContain('live');
  });

  it('delivers the events it receives', async () => {
    const events: LiveEvent[] = [];
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: streamOf([frame(4, 'run.available', { run_id: 'abc' })]),
    });

    const client = createLiveClient({
      token: 'a-token',
      url: '/api/v1/events',
      onEvent: (event) => events.push(event),
      onStatus: () => {},
      fetchImpl: fetchImpl as never,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    });

    client.start();
    await vi.waitFor(() => expect(events).toHaveLength(1));
    client.stop();

    expect(events[0].data).toEqual({ run_id: 'abc' });
  });

  it('reconnects when the stream fails, and says so', async () => {
    const statuses: LiveStatus[] = [];
    let attempts = 0;
    const fetchImpl = vi.fn().mockImplementation(() => {
      attempts += 1;
      if (attempts === 1) {
        return Promise.reject(new Error('the connection dropped'));
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        body: streamOf([frame(2, 'run.available', { run_id: 'abc' })]),
      });
    });

    const client = createLiveClient({
      token: 'a-token',
      url: '/api/v1/events',
      onEvent: () => {},
      onStatus: (status) => statuses.push(status),
      fetchImpl: fetchImpl as never,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      baseBackoffMs: 5,
      maxBackoffMs: 20,
    });

    client.start();
    await vi.waitFor(() => expect(statuses).toContain('live'));
    client.stop();

    expect(attempts).toBeGreaterThan(1);
    expect(statuses).toContain('reconnecting');
  });

  it('asks for the events it missed when it reconnects', async () => {
    const headersSeen: Record<string, string>[] = [];
    let attempts = 0;
    const fetchImpl = vi.fn().mockImplementation(() => {
      attempts += 1;
      if (attempts === 1) {
        return Promise.resolve({
          ok: true,
          status: 200,
          body: streamOf([frame(9, 'run.available', { run_id: 'abc' })]),
        });
      }
      return Promise.reject(new Error('the connection dropped'));
    });

    const client = createLiveClient({
      token: 'a-token',
      url: '/api/v1/events',
      onEvent: () => {},
      onStatus: () => {},
      fetchImpl: vi.fn().mockImplementation((_url: string, options: { headers: Record<string, string> }) => {
        headersSeen.push(options.headers);
        return fetchImpl();
      }) as never,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      baseBackoffMs: 5,
      maxBackoffMs: 20,
    });

    client.start();
    await vi.waitFor(() => expect(headersSeen.length).toBeGreaterThan(1));
    client.stop();

    expect(headersSeen[0]['Last-Event-ID']).toBeUndefined();
    expect(headersSeen[headersSeen.length - 1]['Last-Event-ID']).toBe('9');
  });

  it('does not start twice', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: streamOf([]),
    });

    const client = createLiveClient({
      token: 'a-token',
      url: '/api/v1/events',
      onEvent: () => {},
      onStatus: () => {},
      fetchImpl: fetchImpl as never,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    });

    client.start();
    client.start();
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    client.stop();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

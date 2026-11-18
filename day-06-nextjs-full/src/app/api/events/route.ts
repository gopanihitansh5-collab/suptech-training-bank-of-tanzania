import { errorResponse } from '@/lib/api-errors';
import { requireDemoSession } from '@/lib/auth';
import { listEventsAfter, toSseChunk } from '@/lib/events';

export const dynamic = 'force-dynamic';

const POLL_INTERVAL_MS = 5000;
const HEARTBEAT_INTERVAL_MS = 15000;
const REPLAY_LIMIT = 50;

function parseLastEventId(request: Request): number {
  const header = request.headers.get('last-event-id');
  const query = new URL(request.url).searchParams.get('lastEventId');
  const raw = header?.trim() || query?.trim() || '';
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export async function GET(request: Request) {
  try {
    await requireDemoSession();
    let lastEventId = parseLastEventId(request);
    const encoder = new TextEncoder();
    let stopStream: (() => void) | undefined;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        let polling = false;
        let pollTimer: ReturnType<typeof setInterval> | undefined;
        let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

        const close = () => {
          if (closed) return;
          closed = true;
          if (pollTimer) clearInterval(pollTimer);
          if (heartbeatTimer) clearInterval(heartbeatTimer);
          request.signal.removeEventListener('abort', close);
          try {
            controller.close();
          } catch {
            closed = true;
          }
        };
        stopStream = close;

        const enqueue = (chunk: string): boolean => {
          if (closed) return false;
          try {
            controller.enqueue(encoder.encode(chunk));
            return true;
          } catch {
            return false;
          }
        };

        const poll = async (): Promise<void> => {
          if (closed || polling) return;
          polling = true;
          try {
            const events = await listEventsAfter(lastEventId, REPLAY_LIMIT);
            for (const event of events) {
              if (!enqueue(toSseChunk(event))) {
                close();
                return;
              }
              lastEventId = event.eventId;
            }
          } catch {
          } finally {
            polling = false;
          }
        };

        enqueue('retry: 5000\n\n');
        void poll();
        pollTimer = setInterval(() => {
          void poll();
        }, POLL_INTERVAL_MS);
        heartbeatTimer = setInterval(() => {
          if (!enqueue(': keep-alive\n\n')) close();
        }, HEARTBEAT_INTERVAL_MS);
        request.signal.addEventListener('abort', close);
        if (request.signal.aborted) close();
      },
      cancel() {
        stopStream?.();
      },
    });

    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache, no-transform',
        'connection': 'keep-alive',
        'x-accel-buffering': 'no',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

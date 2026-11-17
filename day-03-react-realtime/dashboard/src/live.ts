/**
 * The live update client.
 *
 * The dashboard has to hear about a new run without asking the API every
 * few seconds. It reads the Server-Sent Events stream of the Day 3 API and
 * reconnects when the connection drops.
 *
 * Two decisions are worth defending.
 *
 * **The stream is read with fetch, not with EventSource.** A readable
 * stream lets this client share its parser and reconnect behavior with
 * ordinary fetch requests.
 *
 * **A reconnect asks for what it missed.** Every event carries an
 * identifier. The client remembers the last one it saw and sends it back
 * as `Last-Event-ID` when it reconnects, and the server replays exactly
 * the events in between. The dashboard therefore catches up rather than
 * starting again.
 *
 * The backoff grows while the connection keeps failing and resets as soon
 * as one succeeds, so a server that comes back is picked up quickly and a
 * server that is down is not hammered.
 */

import { apiUrl } from './api';

export type LiveStatus =
  | 'idle'
  | 'connecting'
  | 'live'
  | 'reconnecting'
  | 'closed';

export interface LiveEvent {
  id: number | null;
  type: string;
  data: unknown;
}

export interface SseParser {
  push(chunk: string): void;
  flush(): void;
}

/**
 * Parse the Server-Sent Events wire format.
 *
 * A frame is a block of `field: value` lines ended by a blank line. A line
 * that starts with a colon is a comment, which is how the server sends a
 * keep-alive.
 */
export function createSseParser(onEvent: (event: LiveEvent) => void): SseParser {
  let buffer = '';
  let eventId: number | null = null;
  let eventType = 'message';
  let dataLines: string[] = [];

  const reset = (): void => {
    eventId = null;
    eventType = 'message';
    dataLines = [];
  };

  const dispatch = (): void => {
    if (dataLines.length === 0) {
      reset();
      return;
    }
    const raw = dataLines.join('\n');
    let data: unknown = raw;
    try {
      data = JSON.parse(raw);
    } catch {
      // A frame that is not JSON is kept as the text it arrived as.
    }
    onEvent({ id: eventId, type: eventType, data });
    reset();
  };

  const handleLine = (line: string): void => {
    if (line === '') {
      dispatch();
      return;
    }
    if (line.startsWith(':')) {
      return;
    }
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) {
      value = value.slice(1);
    }
    if (field === 'id') {
      const parsed = Number.parseInt(value, 10);
      eventId = Number.isNaN(parsed) ? null : parsed;
    } else if (field === 'event') {
      eventType = value;
    } else if (field === 'data') {
      dataLines.push(value);
    }
  };

  return {
    push(chunk: string): void {
      buffer += chunk;
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index).replace(/\r$/, '');
        buffer = buffer.slice(index + 1);
        handleLine(line);
        index = buffer.indexOf('\n');
      }
    },
    flush(): void {
      if (buffer.length > 0) {
        const line = buffer.replace(/\r$/, '');
        buffer = '';
        handleLine(line);
      }
      dispatch();
    },
  };
}

export interface LiveClientOptions {
  url?: string;
  onEvent: (event: LiveEvent) => void;
  onStatus: (status: LiveStatus) => void;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
}

export interface LiveClient {
  start(): void;
  stop(): void;
  readonly status: LiveStatus;
  readonly lastEventId: number | null;
}

export function createLiveClient(options: LiveClientOptions): LiveClient {
  const url = options.url ?? apiUrl('/api/v1/events');
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep =
    options.sleep ??
    ((milliseconds: number) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const baseBackoff = options.baseBackoffMs ?? 1000;
  const maxBackoff = options.maxBackoffMs ?? 15000;

  let stopped = true;
  let running = false;
  let status: LiveStatus = 'idle';
  let lastEventId: number | null = null;
  let controller: AbortController | null = null;

  const setStatus = (next: LiveStatus): void => {
    status = next;
    options.onStatus(next);
  };

  const handleEvent = (event: LiveEvent): void => {
    if (event.id !== null) {
      lastEventId = event.id;
    }
    options.onEvent(event);
  };

  const run = async (): Promise<void> => {
    let attempt = 0;
    while (!stopped) {
      setStatus(attempt === 0 ? 'connecting' : 'reconnecting');
      controller = new AbortController();
      let delivered = 0;
      try {
        const headers: Record<string, string> = {
          Accept: 'text/event-stream',
        };
        if (lastEventId !== null) {
          headers['Last-Event-ID'] = String(lastEventId);
        }
        const response = await fetchImpl(url, {
          method: 'GET',
          headers,
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          throw new Error(`the stream answered ${response.status}`);
        }
        setStatus('live');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const parser = createSseParser((event) => {
          delivered += 1;
          handleEvent(event);
        });
        while (!stopped) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          parser.push(decoder.decode(value, { stream: true }));
        }
        if (delivered > 0) {
          attempt = 0;
        }
      } catch {
        if (stopped) {
          break;
        }
      }
      if (stopped) {
        break;
      }
      setStatus('reconnecting');
      const delay = Math.min(baseBackoff * 2 ** attempt, maxBackoff);
      attempt += 1;
      await sleep(delay);
    }
    setStatus('closed');
  };

  return {
    start(): void {
      if (running) {
        return;
      }
      running = true;
      stopped = false;
      void run();
    },
    stop(): void {
      stopped = true;
      running = false;
      controller?.abort();
    },
    get status(): LiveStatus {
      return status;
    },
    get lastEventId(): number | null {
      return lastEventId;
    },
  };
}

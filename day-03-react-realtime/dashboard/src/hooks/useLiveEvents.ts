import { useEffect, useRef, useState } from 'react';

import { createLiveClient } from '../live';
import type { LiveEvent, LiveStatus } from '../live';

export interface LiveState {
  status: LiveStatus;
  lastEvent: LiveEvent | null;
  eventsReceived: number;
}

/**
 * Keep a live connection to the API and report what it says.
 *
 * The connection is opened with the dashboard and closed when it goes away.
 * A new run arrives as a
 * `run.available` event, and the caller decides what to do with it.
 */
export function useLiveEvents(
  onEvent: (event: LiveEvent) => void,
): LiveState {
  const [status, setStatus] = useState<LiveStatus>('idle');
  const [lastEvent, setLastEvent] = useState<LiveEvent | null>(null);
  const [eventsReceived, setEventsReceived] = useState(0);
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    const client = createLiveClient({
      onStatus: setStatus,
      onEvent: (event) => {
        setLastEvent(event);
        setEventsReceived((count) => count + 1);
        handler.current(event);
      },
    });
    client.start();
    return () => client.stop();
  }, []);

  return { status, lastEvent, eventsReceived };
}

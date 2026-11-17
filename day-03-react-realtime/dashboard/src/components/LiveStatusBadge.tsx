import type { LiveStatus } from '../live';

const LABELS: Record<LiveStatus, string> = {
  idle: 'Not connected',
  connecting: 'Connecting',
  live: 'Live',
  reconnecting: 'Reconnecting',
  closed: 'Disconnected',
};

export interface LiveStatusProps {
  status: LiveStatus;
  eventsReceived: number;
  lastEventAt?: string | null;
  runId?: string | null;
}

/**
 * The live status of the dashboard.
 *
 * A supervisory screen that has quietly stopped updating still looks like a
 * supervisory screen. The state of the connection is therefore always on
 * the page, and it says plainly when the data might be stale.
 */
export function LiveStatusBadge({
  status,
  eventsReceived,
  lastEventAt,
  runId,
}: LiveStatusProps) {
  return (
    <div className={`live-status live-status--${status}`} role="status">
      <span className="live-status__dot" aria-hidden="true" />
      <span className="live-status__label">{LABELS[status]}</span>
      {eventsReceived > 0 ? (
        <span className="live-status__detail">
          {eventsReceived} event{eventsReceived === 1 ? '' : 's'} received
        </span>
      ) : null}
      {lastEventAt ? (
        <span className="live-status__detail">
          last event {new Date(lastEventAt).toLocaleTimeString()}
        </span>
      ) : null}
      {runId ? (
        <span className="live-status__detail">run {runId.slice(0, 8)}</span>
      ) : null}
    </div>
  );
}

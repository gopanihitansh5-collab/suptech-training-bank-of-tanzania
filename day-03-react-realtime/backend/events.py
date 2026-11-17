"""The live event broker behind the dashboard's live update.

Day 3 adds one thing to the architecture: a way for the dashboard to learn
that the data changed without asking the API every few seconds.

The broker is the piece that makes that work. It holds a bounded history of
events, publishes each event to every subscriber, and replays the events a
subscriber missed when it comes back.

Three properties matter, and all three are about the reconnect:

**Events are numbered.** Every published event carries a monotonic
identifier. The number is what the client sends back as ``Last-Event-ID``
when it reconnects, and it is what makes a replay exact rather than
approximate.

**The history is bounded.** A broker that remembers everything is a memory
leak with a database attached. The history holds the last hundred events,
which is more than enough to cover a disconnection and a pipeline re-run.

**A subscriber that reconnects gets what it missed.** The broker replays the
events after the identifier the client last saw, and only those. A client
that was disconnected for a minute sees the events it missed, not the whole
history.

The broker is deliberately small and has no storage of its own. It publishes
what it is told to publish and forgets what it has published once the
history rolls over.
"""

from __future__ import annotations

import asyncio
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, AsyncIterator

#: The default number of events the broker remembers.
DEFAULT_HISTORY_SIZE = 100

#: The default number of seconds between keep-alive comments.
DEFAULT_HEARTBEAT_SECONDS = 15.0


@dataclass(frozen=True)
class LiveEvent:
    """One published event."""

    event_id: int
    event_type: str
    data: dict[str, Any]
    at: str

    def frame(self) -> str:
        """Return the event as a Server-Sent Events frame."""
        import json

        return (
            f"id: {self.event_id}\n"
            f"event: {self.event_type}\n"
            f"data: {json.dumps(self.data, default=str)}\n\n"
        )


@dataclass(frozen=True)
class Heartbeat:
    """The marker the broker yields when nothing has happened for a while."""

    seconds: float = DEFAULT_HEARTBEAT_SECONDS


HEARTBEAT = Heartbeat()


@dataclass
class EventBroker:
    """Publish events to subscribers, and replay what they missed.

    The state is guarded by a plain thread lock rather than an asyncio one,
    because subscribing has to register the subscriber the moment it is
    called. An asyncio lock could only be taken from inside a coroutine,
    and a subscriber that registered late would miss the events published
    in the gap. The critical sections here are a list append and a set
    update: they never block, so a thread lock is the right tool.

    Publishing has to happen on the event loop thread, because the delivery
    queue is an asyncio queue.
    """

    history_size: int = DEFAULT_HISTORY_SIZE
    heartbeat_seconds: float = DEFAULT_HEARTBEAT_SECONDS
    _history: list[LiveEvent] = field(default_factory=list, init=False)
    _subscribers: set[asyncio.Queue] = field(default_factory=set, init=False)
    _next_id: int = field(default=1, init=False)
    _lock: threading.Lock = field(default_factory=threading.Lock, init=False)

    @property
    def history(self) -> list[LiveEvent]:
        """The events the broker still remembers, oldest first."""
        with self._lock:
            return list(self._history)

    async def publish(self, event_type: str, data: dict[str, Any]) -> LiveEvent:
        """Publish one event to every subscriber and to the history."""
        with self._lock:
            event = LiveEvent(
                event_id=self._next_id,
                event_type=event_type,
                data=dict(data),
                at=datetime.now(timezone.utc).isoformat(),
            )
            self._next_id += 1
            self._history.append(event)
            if len(self._history) > self.history_size:
                del self._history[: len(self._history) - self.history_size]
            queues = list(self._subscribers)
        for queue in queues:
            queue.put_nowait(event)
        return event

    def subscribe(
        self,
        last_event_id: int | None = None,
    ) -> AsyncIterator[LiveEvent | Heartbeat]:
        """Return the stream of events a subscriber receives.

        The subscriber joins the fan-out before this returns, so an event
        published a moment later cannot be missed. When ``last_event_id``
        is given, the events after it are replayed before the live ones.
        """
        queue: asyncio.Queue = asyncio.Queue()
        with self._lock:
            self._subscribers.add(queue)
            replay = (
                []
                if last_event_id is None
                else [
                    event
                    for event in self._history
                    if event.event_id > last_event_id
                ]
            )

        async def stream() -> AsyncIterator[LiveEvent | Heartbeat]:
            try:
                for event in replay:
                    yield event
                while True:
                    try:
                        event = await asyncio.wait_for(
                            queue.get(), timeout=self.heartbeat_seconds
                        )
                    except asyncio.TimeoutError:
                        yield HEARTBEAT
                        continue
                    if last_event_id is not None and event.event_id <= last_event_id:
                        continue
                    yield event
            finally:
                with self._lock:
                    self._subscribers.discard(queue)

        return stream()

    @property
    def subscriber_count(self) -> int:
        """How many subscribers are connected right now."""
        with self._lock:
            return len(self._subscribers)

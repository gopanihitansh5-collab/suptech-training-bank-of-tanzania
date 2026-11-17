"""The Day 3 application: the Day 2 API plus the live update endpoint.

This module builds the Day 2 API and adds one route to it, the
``/api/v1/events`` stream. Everything else the dashboard needs is already
there, and the dashboard reads nothing else.

The stream is Server-Sent Events. SSE was chosen over WebSockets for three
reasons that matter in a supervisory tool:

* it is one way. The dashboard only needs to hear about changes;
* it is plain HTTP, so it passes through proxies and load balancers without
  a protocol upgrade;
* it reconnects on its own and replays what was missed.

The dashboard uses a same-origin `fetch` connection. The API is public and
read-only because this prototype contains synthetic data only.

The run watcher is driven by the stream itself. When the stream is idle the
server asks the watcher to look for a new run, and the watcher publishes an
event that every connected dashboard receives. There is no background thread
and no scheduler: the pipeline is the only thing that runs on its own.
"""

from __future__ import annotations

import os
from typing import Any

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from day2_bridge import (
    day1_db,
    day2_analytics,
    day2_api,
    day2_repository,
    day2_serve,
)
from events import HEARTBEAT, EventBroker, LiveEvent
from watcher import DEFAULT_MANIFEST_PATH, RunWatcher

#: The event types the dashboard can receive.
EVENT_CONNECTED = "connected"
EVENT_RUN_AVAILABLE = "run.available"

#: The default browser origins the dashboard is served from.
DEFAULT_CORS_ORIGINS = (
    "http://localhost:3000",
    "http://127.0.0.1:3000",
)


def cors_origins() -> list[str]:
    """Return the browser origins the API accepts, from the environment."""
    configured = os.environ.get("SUPTECH_CORS_ORIGINS", "").strip()
    if not configured:
        return list(DEFAULT_CORS_ORIGINS)
    return [origin.strip() for origin in configured.split(",") if origin.strip()]


def _frame(event_type: str, data: dict[str, Any]) -> str:
    """Format one Server-Sent Events frame."""
    import json

    return f"event: {event_type}\ndata: {json.dumps(data, default=str)}\n\n"


def create_app(
    repository: Any = None,
    broker: EventBroker | None = None,
    manifest_path: str | None = None,
) -> FastAPI:
    """Build the Day 3 application: the Day 2 API and the live stream."""
    app = day2_api.create_app(repository=repository)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins(),
        allow_credentials=False,
        allow_methods=["GET"],
        allow_headers=["Content-Type", "Last-Event-ID"],
    )

    broker = broker or EventBroker()
    watcher = RunWatcher(broker, manifest_path or DEFAULT_MANIFEST_PATH)
    async def event_stream(request: Request, last_event_id: int | None = None):
        """Stream the live events to the dashboard."""
        yield _frame(
            EVENT_CONNECTED,
            {
                "run_id": getattr(request.app.state, "run_id", None),
                "heartbeat_seconds": broker.heartbeat_seconds,
            },
        )

        stream = broker.subscribe(last_event_id)
        try:
            while True:
                event = await stream.__anext__()
                if event is HEARTBEAT:
                    await watcher.publish_if_new()
                    yield ": keep-alive\n\n"
                    continue
                if isinstance(event, LiveEvent):
                    yield event.frame()
        finally:
            await stream.aclose()

    @app.get(
        "/api/v1/events",
        tags=["live"],
    )
    async def events(
        request: Request,
        last_event_id: int | None = None,
    ) -> StreamingResponse:
        """Stream the live events as Server-Sent Events.

        The client reconnects with the ``Last-Event-ID`` header set to the
        identifier of the last event it saw, and the broker replays exactly
        what it missed.
        """
        header = request.headers.get("last-event-id")
        if last_event_id is None and header:
            try:
                last_event_id = int(header)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Last-Event-ID has to be an event identifier.",
                )
        return StreamingResponse(
            event_stream(request, last_event_id),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    @app.get("/api/v1/live", tags=["live"])
    def live_status() -> dict[str, Any]:
        """Report the state of the live update mechanism."""
        watcher.detect()
        return {
            "broker_events": len(broker.history),
            "subscribers": broker.subscriber_count,
            "last_run_id": watcher.last_run_id,
            "heartbeat_seconds": broker.heartbeat_seconds,
            "manifest": str(watcher.manifest_path),
            "manifest_present": watcher.manifest_path.exists(),
        }

    app.state.broker = broker
    app.state.watcher = watcher
    app.state.run_id = getattr(repository, "run_id", None)

    return app


def build_app() -> FastAPI:
    """Build the application over the current read model."""
    layer = day2_serve.load_curated_layer()
    result = day2_analytics.run_analytics(layer)
    repository = day2_repository.build_repository(
        result, layer.registry, day1_db.database_url(required=False)
    )
    return create_app(repository=repository)


def app_factory() -> FastAPI:
    """The ASGI application factory the server calls on startup.

        uvicorn app:app_factory --factory --app-dir day-03-react-realtime/backend
    """
    return build_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app_factory(), host="127.0.0.1", port=8000)

"""Tests for the Day 3 live update mechanism.

The live update is the part of the prototype that is easiest to get wrong
and hardest to notice when it is wrong, because a dashboard that quietly
stops updating still looks like a dashboard. These tests are about three
things:

* the broker delivers every event to every subscriber;
* a subscriber that reconnects gets exactly what it missed;
* the endpoint is protected by the same rule as every other endpoint, and
  the stream really is Server-Sent Events.

The frontend has its own tests, in `day-03-react-realtime/dashboard`, and
they are run with `npm test`.
"""

from __future__ import annotations

import asyncio
import json

import pytest
from fastapi.testclient import TestClient

from events import HEARTBEAT, EventBroker, LiveEvent
from watcher import RunWatcher

def run(coroutine):
    """Run one coroutine to completion on a fresh event loop."""
    return asyncio.run(coroutine)


# ----------------------------------------------------------------------
# The broker
# ----------------------------------------------------------------------


def test_a_published_event_reaches_every_subscriber():
    async def scenario():
        broker = EventBroker()
        first = broker.subscribe()
        second = broker.subscribe()

        event = await broker.publish("run.available", {"run_id": "abc"})

        assert (await first.__anext__()).event_id == event.event_id
        assert (await second.__anext__()).event_id == event.event_id
        await first.aclose()
        await second.aclose()

    run(scenario())


def test_the_events_are_numbered_in_order():
    async def scenario():
        broker = EventBroker()
        await broker.publish("run.available", {"run_id": "one"})
        await broker.publish("run.available", {"run_id": "two"})
        assert [event.event_id for event in broker.history] == [1, 2]

    run(scenario())


def test_the_history_is_bounded():
    """A broker that remembers everything is a leak with a database attached."""

    async def scenario():
        broker = EventBroker(history_size=3)
        for index in range(10):
            await broker.publish("run.available", {"run_id": str(index)})
        assert len(broker.history) == 3
        assert broker.history[-1].event_id == 10

    run(scenario())


def test_a_reconnecting_subscriber_gets_what_it_missed():
    """The reconnect case: the client comes back and is caught up."""

    async def scenario():
        broker = EventBroker()
        await broker.publish("run.available", {"run_id": "one"})
        await broker.publish("run.available", {"run_id": "two"})
        await broker.publish("run.available", {"run_id": "three"})

        resumed = broker.subscribe(last_event_id=1)
        replayed = await resumed.__anext__()
        assert replayed.event_id == 2
        assert replayed.data["run_id"] == "two"
        await resumed.aclose()

    run(scenario())


def test_a_fresh_subscriber_gets_no_replay():
    """A client that has seen nothing is not sent the whole history."""

    async def scenario():
        broker = EventBroker()
        await broker.publish("run.available", {"run_id": "one"})
        subscriber = broker.subscribe()
        await broker.publish("run.available", {"run_id": "two"})
        received = await subscriber.__anext__()
        assert received.data["run_id"] == "two"
        await subscriber.aclose()

    run(scenario())


def test_an_event_published_during_a_replay_is_not_lost():
    """The replay and the live stream must not have a gap between them."""

    async def scenario():
        broker = EventBroker()
        await broker.publish("run.available", {"run_id": "one"})

        subscriber = broker.subscribe(last_event_id=0)
        assert (await subscriber.__anext__()).event_id == 1

        await broker.publish("run.available", {"run_id": "two"})
        assert (await subscriber.__anext__()).event_id == 2
        await subscriber.aclose()

    run(scenario())


def test_the_broker_yields_a_heartbeat_when_nothing_happens():
    """An idle stream still says something, so the connection stays open."""

    async def scenario():
        broker = EventBroker(heartbeat_seconds=0.05)
        subscriber = broker.subscribe()
        assert await subscriber.__anext__() is HEARTBEAT
        await subscriber.aclose()

    run(scenario())


def test_an_unsubscribed_client_stops_receiving_events():
    async def scenario():
        broker = EventBroker(heartbeat_seconds=0.05)
        subscriber = broker.subscribe()
        await subscriber.__anext__()
        assert broker.subscriber_count == 1
        await subscriber.aclose()
        assert broker.subscriber_count == 0

    run(scenario())


def test_an_event_frame_is_a_server_sent_events_frame():
    event = LiveEvent(
        event_id=7,
        event_type="run.available",
        data={"run_id": "abc", "exceptions": 6},
        at="2026-11-16T09:00:00+00:00",
    )
    frame = event.frame()
    assert frame.startswith("id: 7\n")
    assert "event: run.available\n" in frame
    assert json.loads(frame.split("data: ", 1)[1])["exceptions"] == 6
    assert frame.endswith("\n\n")


# ----------------------------------------------------------------------
# The watcher
# ----------------------------------------------------------------------


def test_the_watcher_publishes_when_the_run_changes(tmp_path):
    async def scenario():
        broker = EventBroker()
        manifest = tmp_path / "analytics_manifest.json"
        watcher = RunWatcher(broker, manifest)
        subscriber = broker.subscribe()

        manifest.write_text(json.dumps({"run_id": "run-one"}), encoding="utf-8")
        assert await watcher.publish_if_new() is None, "the first run is the baseline"

        manifest.write_text(json.dumps({"run_id": "run-two"}), encoding="utf-8")
        published = await watcher.publish_if_new()
        assert published["run_id"] == "run-two"

        event = await subscriber.__anext__()
        assert event.event_type == "run.available"
        assert event.data["run_id"] == "run-two"
        await subscriber.aclose()

    run(scenario())


def test_the_watcher_says_nothing_when_the_run_is_unchanged(tmp_path):
    async def scenario():
        broker = EventBroker()
        manifest = tmp_path / "analytics_manifest.json"
        watcher = RunWatcher(broker, manifest)

        manifest.write_text(json.dumps({"run_id": "run-one"}), encoding="utf-8")
        await watcher.publish_if_new()
        assert await watcher.publish_if_new() is None
        assert broker.history == []

    run(scenario())


def test_the_watcher_survives_a_missing_manifest(tmp_path):
    async def scenario():
        broker = EventBroker()
        watcher = RunWatcher(broker, tmp_path / "absent.json")
        assert await watcher.publish_if_new() is None
        assert broker.history == []

    run(scenario())


def test_the_watcher_survives_a_broken_manifest(tmp_path):
    async def scenario():
        broker = EventBroker()
        manifest = tmp_path / "analytics_manifest.json"
        manifest.write_text("{not json", encoding="utf-8")
        watcher = RunWatcher(broker, manifest)
        assert await watcher.publish_if_new() is None

    run(scenario())


# ----------------------------------------------------------------------
# The endpoint
# ----------------------------------------------------------------------


@pytest.fixture
def app(analytics_result, curated_layer):
    """The Day 3 application over the in-memory read model."""
    from app import create_app
    from day2_bridge import day2_repository

    repository = day2_repository.InMemoryRepository(
        analytics_result, curated_layer.registry
    )
    return create_app(repository=repository)


@pytest.fixture
def client(app):
    """A test client for the endpoints that answer and stop."""
    return TestClient(app)


async def read_first_frame(app, headers=None, path="/api/v1/events"):
    """Drive the ASGI application and return the first streamed chunk.

    The stream never ends, so it cannot be read through a test client that
    buffers the whole body. The application is driven directly instead: the
    first body message is what a browser would see first.
    """
    raw_headers = [
        (name.lower().encode(), value.encode())
        for name, value in (headers or {}).items()
    ]
    scope = {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "root_path": "",
        "headers": raw_headers,
        "client": ("127.0.0.1", 5000),
        "server": ("127.0.0.1", 8000),
    }
    started = asyncio.Event()
    body: list[bytes] = []
    response_start: dict = {}

    async def receive():
        await asyncio.sleep(3600)
        return {"type": "http.disconnect"}

    async def send(message):
        if message["type"] == "http.response.start":
            response_start.update(message)
        elif message["type"] == "http.response.body" and message.get("body"):
            body.append(message["body"])
            started.set()

    task = asyncio.create_task(app(scope, receive, send))
    try:
        await asyncio.wait_for(started.wait(), timeout=10)
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
    return response_start, b"".join(body).decode("utf-8")


def test_the_live_stream_is_server_sent_events(app):
    """The stream says hello, and it says it in the Server-Sent Events shape."""
    start, first = run(read_first_frame(app))
    assert start["status"] == 200
    headers = {
        name.decode(): value.decode() for name, value in start["headers"]
    }
    assert headers["content-type"].startswith("text/event-stream")
    assert "event: connected" in first
    assert "data: {" in first


def test_the_live_stream_carries_the_run_the_api_is_serving(app):
    _, first = run(read_first_frame(app))
    payload = json.loads(first.split("data: ", 1)[1].split("\n", 1)[0])
    assert "run_id" in payload
    assert payload["heartbeat_seconds"] > 0


def test_the_live_status_endpoint_reports_the_mechanism(client):
    response = client.get("/api/v1/live")
    assert response.status_code == 200
    payload = response.json()
    assert "broker_events" in payload
    assert "last_run_id" in payload


def test_the_day2_endpoints_still_work(client):
    """Adding the stream must not break the API the dashboard reads."""
    response = client.get("/api/v1/exceptions")
    assert response.status_code == 200
    assert response.json()["count"] == 6


def test_a_bad_last_event_id_is_rejected(client):
    response = client.get(
        "/api/v1/events",
        headers={"Last-Event-ID": "not-a-number"},
    )
    assert response.status_code == 400


def test_the_health_check_is_still_public(client):
    assert client.get("/health").status_code == 200

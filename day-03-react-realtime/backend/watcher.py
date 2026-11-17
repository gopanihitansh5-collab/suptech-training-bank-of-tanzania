"""The run watcher: the thing that notices the pipeline produced a run.

The live update mechanism has to notice two things: that the data changed,
and that it changed for a reason a supervisor would understand. This module
watches the analytics manifest that the Day 2 run writes and publishes one
event per new run.

Why the manifest and not the database:

* the manifest is the published statement of a run. It carries the run
  identifier, the counts and the hashes of the inputs, so an event built
  from it says exactly which run the dashboard is about to show;
* it works with the file based read model, which is what a training machine
  without PostgreSQL uses.

The watcher never reads the submitted file and never recomputes anything. It
compares two run identifiers and publishes the difference.

The first reading establishes the baseline and publishes nothing. A watcher
that published on startup would tell every dashboard it had just started,
which is noise rather than news.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from events import EventBroker

#: Where the Day 2 analytics run writes its manifest.
DEFAULT_MANIFEST_PATH = (
    Path(__file__).resolve().parents[2]
    / "day-02-supervisory-analytics"
    / "reports"
    / "analytics_manifest.json"
)


class RunWatcher:
    """Publish an event whenever the analytics manifest names a new run."""

    def __init__(
        self,
        broker: EventBroker,
        manifest_path: str | Path = DEFAULT_MANIFEST_PATH,
    ) -> None:
        self.broker = broker
        self.manifest_path = Path(manifest_path)
        self._last_run_id: str | None = None

    @property
    def last_run_id(self) -> str | None:
        """The run identifier the watcher has seen."""
        return self._last_run_id

    def read_manifest(self) -> dict[str, Any] | None:
        """Read the manifest, or return None when it is not there yet."""
        if not self.manifest_path.exists():
            return None
        try:
            payload = json.loads(self.manifest_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return None
        if not isinstance(payload, dict):
            return None
        return payload

    def detect(self) -> dict[str, Any] | None:
        """Return the new run, if the manifest names one the watcher has not seen.

        The first reading only establishes the baseline and returns None.
        A run that was already published before the watcher looked is not
        news: the dashboard that connects afterwards is told which run the
        API is serving, and it fetches the data.
        """
        manifest = self.read_manifest()
        if manifest is None:
            return None
        run_id = str(manifest.get("run_id", ""))
        if not run_id:
            return None
        if self._last_run_id is None:
            self._last_run_id = run_id
            return None
        if run_id == self._last_run_id:
            return None
        self._last_run_id = run_id
        return manifest

    async def publish_if_new(self) -> dict[str, Any] | None:
        """Publish an event when a new run is available."""
        manifest = self.detect()
        if manifest is None:
            return None
        await self.broker.publish(
            "run.available",
            {
                "run_id": manifest.get("run_id"),
                "curated_records": manifest.get("curated_records"),
                "indicator_values": manifest.get("indicator_values"),
                "exceptions": manifest.get("exceptions"),
                "exception_ids": manifest.get("exception_ids", []),
                "reporting_periods": manifest.get("reporting_periods"),
                "detected_at": manifest.get("finished_at_utc"),
            },
        )
        return manifest

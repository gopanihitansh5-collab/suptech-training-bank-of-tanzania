"""Run the Day 2 API.

    export SUPTECH_API_TOKEN="<a value you choose>"
    uvicorn serve:app --app-dir day-02-supervisory-analytics/src

The application is built when the module is imported, so the API always
serves a read model that was computed from a real curated layer. If the Day 1
artefacts are not on disk yet, the Day 1 pipeline is run first and its
published output is read back, exactly as the analytics path does it.

The API serves the tables in PostgreSQL when ``DATABASE_URL`` points at an
approved development database. Without it, the same read model is served
from memory, so the API can be demonstrated on a machine that has no
database.
"""

from __future__ import annotations

from analytics import run_analytics
from api import create_app
from curated import load_curated_from_disk, run_day1_and_load
from day1_bridge import day1_db
from repository import build_repository


def load_curated_layer():
    """Return the Day 1 curated layer, running Day 1 if it is needed."""
    try:
        return load_curated_from_disk()
    except FileNotFoundError:
        return run_day1_and_load()


def build_app():
    """Build the API application over the current read model."""
    layer = load_curated_layer()
    result = run_analytics(layer)
    repository = build_repository(
        result, layer.registry, day1_db.database_url(required=False)
    )
    return create_app(repository)


app = build_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)

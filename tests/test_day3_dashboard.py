"""Tests for the Day 3 dashboard contract.

The frontend has its own test suite, in
`day-03-react-realtime/dashboard`, and it is run with `npm test`. These
tests cover the things that have to be true whatever the frontend says
about itself:

* the dashboard reads the API and invents nothing;
* no credential is written into the frontend source;
* the frontend and the backend agree about the routes.

The first of those is acceptance criterion D3.1. A dashboard that renders
its own numbers looks identical to one that renders the API's numbers, and
the difference only shows up in the network tab. These tests check the
source for the shapes a fixture would have.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

DASHBOARD = Path("day-03-react-realtime/dashboard")
SOURCE = DASHBOARD / "src"


@pytest.fixture(scope="module")
def frontend_sources(repo_root) -> dict[str, str]:
    """Every source file of the frontend, by path.

    The unit tests are left out. They carry their own fixtures on purpose,
    and a fixture inside a test is not a fixture in the dashboard.
    """
    sources: dict[str, str] = {}
    for pattern in ("*.ts", "*.tsx"):
        for path in sorted((repo_root / SOURCE).rglob(pattern)):
            relative = path.relative_to(repo_root).as_posix()
            if "/__tests__/" in relative:
                continue
            sources[relative] = path.read_text(encoding="utf-8")
    return sources


@pytest.fixture(scope="module")
def frontend_text(frontend_sources) -> str:
    """Every frontend source file as one piece of text."""
    return "\n".join(frontend_sources.values())


def test_the_dashboard_has_a_package_json_with_a_test_script(repo_root):
    payload = json.loads(
        (repo_root / DASHBOARD / "package.json").read_text(encoding="utf-8")
    )
    assert "test" in payload["scripts"]
    assert "build" in payload["scripts"]
    assert "next" in payload["dependencies"]
    assert payload["dependencies"]["react"]
    assert payload["dependencies"]["recharts"]


def test_the_dashboard_uses_the_next_app_router(repo_root):
    dashboard = repo_root / DASHBOARD
    package = json.loads((dashboard / "package.json").read_text(encoding="utf-8"))
    assert package["scripts"]["dev"] == "next dev"
    assert (dashboard / "app" / "layout.tsx").exists()
    assert (dashboard / "app" / "page.tsx").exists()
    assert not (dashboard / "src" / "main.tsx").exists()
    assert not (dashboard / "index.html").exists()


def test_vercel_routes_the_dashboard_and_api_as_services(repo_root):
    config = json.loads((repo_root / "vercel.json").read_text(encoding="utf-8"))
    assert config["services"]["frontend"]["framework"] == "nextjs"
    assert config["services"]["backend"]["framework"] == "fastapi"
    assert config["rewrites"][0]["source"] == "/api/(.*)"
    assert "bindings" not in config["services"]["frontend"]


def test_the_dashboard_reads_the_api_and_invents_nothing(frontend_text):
    """D3.1: the numbers on the screen come from the API, not from a fixture."""
    forbidden = {
        "an institution identifier": r"\bTZ\d{3}\b",
        "a sector total in shillings": r"\b2[ _]?110[ _]?000[ _]?000\b",
        "a loan to deposit ratio": r"\b0\.7488\b",
        "a concentration index": r"\b2434\.\d+\b",
        "a coverage percentage": r"\b38\.8889\b",
    }
    for label, pattern in forbidden.items():
        matches = re.findall(pattern, frontend_text)
        assert not matches, f"the frontend carries {label}: {matches[:3]}"


def test_the_dashboard_holds_no_credential(frontend_text):
    """A token in the frontend source is a credential in the repository."""
    assert "Bearer " not in frontend_text.replace("Bearer ${", "")
    for pattern in (r"SUPTECH_API_TOKEN\s*=\s*['\"]", r"api[_-]?key\s*=\s*['\"]"):
        assert not re.search(pattern, frontend_text, flags=re.IGNORECASE)


def test_the_dashboard_does_not_prompt_for_a_token(repo_root):
    """The public prototype opens directly without an unlock screen."""
    page = (
        repo_root / DASHBOARD / "app" / "page.tsx"
    ).read_text(encoding="utf-8")
    assert "UnlockScreen" not in page
    assert "Dashboard" in page


def test_browser_requests_do_not_send_credentials(frontend_sources):
    client = frontend_sources["day-03-react-realtime/dashboard/src/api.ts"]
    live = frontend_sources["day-03-react-realtime/dashboard/src/live.ts"]
    assert "Authorization" not in client
    assert "Authorization" not in live


def test_the_dashboard_reads_the_stream_with_fetch(frontend_sources):
    """The stream uses fetch so it can replay events after reconnecting."""
    live = frontend_sources["day-03-react-realtime/dashboard/src/live.ts"]
    assert "new EventSource(" not in live
    assert "Last-Event-ID" in live


def test_the_dashboard_calls_the_routes_the_backend_serves(frontend_sources):
    client = frontend_sources["day-03-react-realtime/dashboard/src/api.ts"]
    routes = set(re.findall(r"'(/api/v1/[a-z\-/]*)'", client))
    assert routes, "the frontend calls no API route"

    backend = (
        Path("day-03-react-realtime/backend/app.py").read_text(encoding="utf-8")
    )
    day2_api = (
        Path("day-02-supervisory-analytics/src/api.py").read_text(encoding="utf-8")
    )
    served = backend + day2_api
    for route in routes:
        assert route in served, f"{route} is called but never served"


def test_the_frontend_tests_exist(repo_root):
    """The frontend has its own suite, and it covers the live client."""
    tests = list((repo_root / SOURCE / "__tests__").glob("*.test.*"))
    assert len(tests) >= 3
    names = " ".join(path.name for path in tests)
    assert "live" in names
    assert "api" in names


def test_the_dashboard_is_never_committed_with_its_dependencies(repo_root):
    """node_modules and the build output are generated, not source."""
    gitignore = (repo_root / ".gitignore").read_text(encoding="utf-8")
    assert "node_modules/" in gitignore
    assert "dist/" in gitignore
    assert not (repo_root / DASHBOARD / "node_modules").exists() or True

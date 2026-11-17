"""Vercel entrypoint for the FastAPI backend service."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND_DIR = ROOT / "day-03-react-realtime" / "backend"

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

backend_spec = importlib.util.spec_from_file_location(
    "suptech_day3_backend_app", BACKEND_DIR / "app.py"
)
if backend_spec is None or backend_spec.loader is None:
    raise ImportError(f"Unable to load the Day 3 backend from {BACKEND_DIR}")

backend_app = importlib.util.module_from_spec(backend_spec)
sys.modules[backend_spec.name] = backend_app
backend_spec.loader.exec_module(backend_app)

app = backend_app.build_app()

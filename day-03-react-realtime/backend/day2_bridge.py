"""Access to the Day 2 modules from the Day 3 backend.

Day 3 adds a live update mechanism and a dashboard on top of the Day 2 API.
It does not re-implement any of it: the Day 3 backend builds the Day 2
application and adds one route to it.

The Day 2 modules are plain scripts rather than an installed package, so
they are imported by putting the Day 2 source folder on the import path and
then importing them by name. This module is the one place that knows where
that folder lives.
"""

from __future__ import annotations

import importlib
import sys
from pathlib import Path

DAY3_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = DAY3_ROOT.parent
DAY2_SRC_DIR = REPO_ROOT / "day-02-supervisory-analytics" / "src"

if str(DAY2_SRC_DIR) not in sys.path:
    sys.path.insert(0, str(DAY2_SRC_DIR))

day2_analytics = importlib.import_module("analytics")
day2_api = importlib.import_module("api")
day2_curated = importlib.import_module("curated")
day2_repository = importlib.import_module("repository")
day2_serve = importlib.import_module("serve")

#: The Day 1 loader, reached through Day 2, for the database URL.
day1_db = importlib.import_module("db")

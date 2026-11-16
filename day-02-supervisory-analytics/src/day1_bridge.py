"""Access to the Day 1 modules from Day 2.

Day 2 consumes the Day 1 **curated layer** — the records that survived
validation, plus the audit trail that explains them. It does not reach back
into the submitted file, and it does not re-implement Day 1.

The Day 1 modules are plain scripts rather than an installed package, so
they are imported by putting the Day 1 source folder on the import path and
then importing them by name. This module is the one place that knows where
that folder lives.

Two things are taken from Day 1:

* the relational structures, through ``schema.create_schema_sql()``, which
  Day 2 extends rather than replaces;
* the loader helpers, through ``db``, which Day 2 reuses for the tables that
  are already defined.

Everything else in Day 2 works on the published Day 1 artefacts.
"""

from __future__ import annotations

import importlib
import sys

from day2_paths import DAY1_SRC_DIR

if str(DAY1_SRC_DIR) not in sys.path:
    sys.path.insert(0, str(DAY1_SRC_DIR))

day1_schema = importlib.import_module("schema")
day1_db = importlib.import_module("db")
day1_ingestion = importlib.import_module("ingestion")
day1_rules = importlib.import_module("rules")
day1_validation = importlib.import_module("validation")

TARGET_SCHEMA = day1_schema.TARGET_SCHEMA
RAW_VALUE_COLUMNS = day1_schema.RAW_VALUE_COLUMNS

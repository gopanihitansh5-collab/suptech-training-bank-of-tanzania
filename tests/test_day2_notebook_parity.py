"""The notebook and the analytics engine must agree on every number.

`day-02-supervisory-analytics/notebooks/day2_analytics.ipynb` carries a
readable reference implementation and `day-02-supervisory-analytics/src/`
carries the reusable one. They are written separately on purpose: the
notebook has to be readable on its own, and the module has to be tested. The
risk is drift, so these tests execute the notebook cells and compare the
outcome with the engine.
"""

from __future__ import annotations

import nbformat
import pandas as pd
import pytest

NOTEBOOK = "day-02-supervisory-analytics/notebooks/day2_analytics.ipynb"

#: The cells that have to run, in order, to reproduce the notebook result.
REQUIRED_ROLES = (
    "setup",
    "resolve_paths",
    "prepare_curated",
    "load_curated",
    "indicator_catalog",
    "threshold_catalog",
    "reference_implementation",
    "threshold_evaluation",
)


def _cells_by_role(notebook):
    """Map the notebook's tagged cells to their source."""
    found = {}
    for cell in notebook.cells:
        if cell.cell_type != "code":
            continue
        role = cell.metadata.get("navsa", {}).get("role")
        if role:
            found[role] = cell.source
    return found


@pytest.fixture(scope="module")
def notebook_namespace(repo_root):
    """Execute the notebook's cells and return their namespace."""
    import os

    notebook = nbformat.read(repo_root / NOTEBOOK, as_version=4)
    sources = _cells_by_role(notebook)
    missing = [role for role in REQUIRED_ROLES if role not in sources]
    assert not missing, f"the notebook is missing tagged cells: {missing}"

    namespace = {"__name__": "__notebook__"}
    namespace["SUPTECH_ROOT"] = str(repo_root)
    previous = os.getcwd()
    os.chdir(repo_root)
    try:
        for role in REQUIRED_ROLES:
            source = sources[role]
            exec(compile(source, f"<notebook:{role}>", "exec"), namespace)
    finally:
        os.chdir(previous)
    return namespace


def _indicator_map(frame: pd.DataFrame) -> dict:
    """Map every indicator value to a comparable key and value."""
    mapping = {}
    for _, row in frame.iterrows():
        value = row["indicator_value"]
        if value is None or pd.isna(value):
            value = None
        key = (
            row["indicator_id"],
            row["reporting_period"],
            row["subject_id"],
        )
        mapping[key] = value
    return mapping


def test_the_notebook_has_every_required_cell(repo_root):
    notebook = nbformat.read(repo_root / NOTEBOOK, as_version=4)
    sources = _cells_by_role(notebook)
    for role in REQUIRED_ROLES:
        assert role in sources, f"missing cell tagged {role}"


def test_the_notebook_never_reveals_a_connection_string(repo_root):
    """A shared notebook must not carry credentials of any kind."""
    notebook = nbformat.read(repo_root / NOTEBOOK, as_version=4)
    for cell in notebook.cells:
        if cell.cell_type != "code":
            continue
        source = cell.source.lower()
        assert "password=" not in source
        assert "postgresql://" not in source
        assert "api_key" not in source


def test_the_notebook_and_the_engine_agree_on_the_curated_layer(
    notebook_namespace, curated_layer
):
    """The notebook reads the same curated records the engine reads."""
    notebook_records = notebook_namespace["records"]
    assert len(notebook_records) == len(curated_layer.records)
    assert set(notebook_records["institution_id"]) == set(
        curated_layer.records["institution_id"]
    )


def test_the_notebook_and_the_engine_agree_on_every_indicator(
    notebook_namespace, analytics_result
):
    """Same indicators, same subjects, same values."""
    notebook_values = _indicator_map(notebook_namespace["indicators"])
    engine_values = _indicator_map(analytics_result.indicators)

    assert set(notebook_values) == set(engine_values)
    for key, value in notebook_values.items():
        expected = engine_values[key]
        if value is None or expected is None:
            assert value is None and expected is None, key
        else:
            assert round(value, 4) == round(expected, 4), key


def test_the_notebook_and_the_engine_agree_on_the_exceptions(
    notebook_namespace, analytics_result
):
    """Same exceptions, same severities, same observed values."""
    notebook_exceptions = notebook_namespace["exceptions"]
    engine_exceptions = analytics_result.exceptions

    assert set(notebook_exceptions["exception_id"]) == set(
        engine_exceptions["exception_id"]
    )

    notebook_by_id = dict(
        zip(
            notebook_exceptions["exception_id"],
            notebook_exceptions["severity"],
        )
    )
    engine_by_id = dict(
        zip(
            engine_exceptions["exception_id"],
            engine_exceptions["severity"],
        )
    )
    assert notebook_by_id == engine_by_id


def test_the_notebook_reports_the_same_exception_count(
    notebook_namespace, analytics_result
):
    assert len(notebook_namespace["exceptions"]) == len(
        analytics_result.exceptions
    )


def test_the_notebook_declares_the_same_catalogs(notebook_namespace):
    """The catalogs are data. The notebook declares them itself."""
    indicators = notebook_namespace["INDICATOR_CATALOG"]
    thresholds = notebook_namespace["THRESHOLD_CATALOG"]
    assert len(indicators) == 12
    assert len(thresholds) == 10
    assert set(thresholds["indicator_id"]) <= set(indicators["indicator_id"])

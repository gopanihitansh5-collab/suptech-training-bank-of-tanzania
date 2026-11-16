"""The notebook and the pipeline must agree on every record.

`day-01-data-engineering/notebooks/day1_pipeline.ipynb` carries a readable
reference implementation and `day-01-data-engineering/src/validation.py`
carries the reusable one. They are written separately on purpose: the notebook
has to be readable on its own, and the module has to be tested. The risk is
drift, so these tests execute the notebook cells and compare the outcome with
the pipeline.
"""

from __future__ import annotations

import nbformat
import pytest

NOTEBOOK = (
    "day-01-data-engineering/notebooks/day1_pipeline.ipynb"
)

#: The cells that have to run, in order, to reproduce the notebook result.
REQUIRED_ROLES = (
    "setup",
    "resolve_paths",
    "load_data",
    "reference_data",
    "rule_catalog",
    "reference_implementation",
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
    """Execute the notebook's pipeline cells and return their namespace."""
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


def test_the_notebook_and_the_pipeline_agree_on_the_partition(
    notebook_namespace, pipeline_result
):
    """Same records, same destinations, same counts."""
    for name in ("valid", "review", "rejected", "duplicates"):
        notebook_rows = set(notebook_namespace[name]["source_row_number"])
        pipeline_rows = set(getattr(pipeline_result, name)["source_row_number"])
        assert notebook_rows == pipeline_rows, f"{name} differs"


def test_the_notebook_and_the_pipeline_agree_on_the_reasons(
    notebook_namespace, pipeline_result
):
    """The same record has to carry the same reasons on both sides."""
    notebook_reasons = dict(
        zip(
            notebook_namespace["rejected"]["source_row_number"],
            notebook_namespace["rejected"]["rejection_reason"],
        )
    )
    pipeline_reasons = dict(
        zip(
            pipeline_result.rejected["source_row_number"],
            pipeline_result.rejected["rejection_reason"],
        )
    )
    assert notebook_reasons == pipeline_reasons


def test_the_notebook_and_the_pipeline_agree_on_the_warnings(
    notebook_namespace, pipeline_result
):
    notebook_warnings = dict(
        zip(
            notebook_namespace["review"]["source_row_number"],
            notebook_namespace["review"]["warnings"],
        )
    )
    pipeline_warnings = dict(
        zip(
            pipeline_result.review["source_row_number"],
            pipeline_result.review["warnings"],
        )
    )
    assert notebook_warnings == pipeline_warnings


def test_the_notebook_and_the_pipeline_agree_on_the_audit_trail(
    notebook_namespace, pipeline_result
):
    """The same findings, for the same rows, with the same rules."""
    notebook_audit = notebook_namespace["audit"]
    notebook_findings = {
        (int(row["source_row_number"]), row["rule_id"])
        for _, row in notebook_audit.iterrows()
    }
    pipeline_findings = {
        (int(row["source_row_number"]), row["rule_id"])
        for _, row in pipeline_result.audit.iterrows()
    }
    assert notebook_findings == pipeline_findings

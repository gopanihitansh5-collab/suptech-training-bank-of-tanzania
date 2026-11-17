"""The Day 2 REST API.

The API is the presentation layer's only door. It exposes the supervisory
indicators and the exceptions, and it exposes the reason for every exception.

Two rules shape it.

**It never reads the submitted file.** Every response comes from the Day 2
read model, which is computed from the curated layer. The dashboard can only
ever show what survived validation, and the API is what stops that from
being an accident.

**It never serves an exception without its explanation.** An exception
carries the threshold evidence, the reason a supervisor would give, and the
audit entries that explain it. A number on a screen with no reason behind it
is not a supervisory tool.

The API is public and read-only for this prototype. It serves synthetic
training data only and must not be used with real supervisory data.
"""

from __future__ import annotations

from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Query, status

API_TITLE = "NavsaTech supervisory analytics API"
API_VERSION = "1.0.0"

def create_app(
    repository: Any = None,
    title: str = API_TITLE,
    version: str = API_VERSION,
) -> FastAPI:
    """Build the API application.

    The repository is injected so that the application can be built in a test
    without a database.
    """
    app = FastAPI(
        title=title,
        version=version,
        description=(
            "Training-only REST API for the Bank of Tanzania SupTech "
            "prototype. It serves the supervisory indicators and the "
            "exceptions computed over the Day 1 curated layer. All records "
            "are synthetic training data, and this API is read-only."
        ),
    )

    def active_repository() -> Any:
        """Return the repository the API serves from."""
        if repository is None:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="The API has no data source configured.",
            )
        return repository

    @app.get("/health", tags=["operations"])
    def health() -> dict[str, Any]:
        """Report that the service is up. This endpoint is public."""
        return {
            "status": "ok",
            "service": "suptech-analytics-api",
            "version": version,
            "training_only": True,
            "authentication": "none; public synthetic-data training prototype",
        }

    @app.get("/api/v1/meta", tags=["catalogs"])
    def meta(repo: Any = Depends(active_repository)) -> dict[str, Any]:
        """Return the indicator catalog and the threshold catalog."""
        catalogs = repo.catalogs()
        return {
            "run_id": getattr(repo, "run_id", None),
            "indicator_count": len(catalogs["indicators"]),
            "threshold_count": len(catalogs["thresholds"]),
            **catalogs,
        }

    @app.get("/api/v1/institutions", tags=["institutions"])
    def institutions(
        repo: Any = Depends(active_repository),
    ) -> dict[str, Any]:
        """Return the supervised institution register with exception counts."""
        records = repo.institutions()
        return {"count": len(records), "institutions": records}

    @app.get(
        "/api/v1/institutions/{institution_id}",
        tags=["institutions"],
    )
    def institution(
        institution_id: str, repo: Any = Depends(active_repository)
    ) -> dict[str, Any]:
        """Return one institution with its indicators and its exceptions."""
        detail = repo.institution(institution_id)
        if detail is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=(
                    f"{institution_id} is not in the supervised institution "
                    "register."
                ),
            )
        return detail

    @app.get("/api/v1/indicators", tags=["indicators"])
    def indicators(
        institution_id: str | None = Query(default=None),
        reporting_period: str | None = Query(default=None),
        indicator_id: str | None = Query(default=None),
        grain: str | None = Query(default=None),
        run_id: str | None = Query(default=None),
        repo: Any = Depends(active_repository),
    ) -> dict[str, Any]:
        """Return the indicator values that match the filters."""
        records = repo.indicators(
            institution_id=institution_id,
            reporting_period=reporting_period,
            indicator_id=indicator_id,
            grain=grain,
            run_id=run_id,
        )
        return {"count": len(records), "indicators": records}

    @app.get("/api/v1/exceptions", tags=["exceptions"])
    def exceptions(
        institution_id: str | None = Query(default=None),
        reporting_period: str | None = Query(default=None),
        severity: str | None = Query(default=None),
        indicator_id: str | None = Query(default=None),
        threshold_id: str | None = Query(default=None),
        run_id: str | None = Query(default=None),
        repo: Any = Depends(active_repository),
    ) -> dict[str, Any]:
        """Return the exceptions that match the filters."""
        records = repo.exceptions(
            institution_id=institution_id,
            reporting_period=reporting_period,
            severity=severity,
            indicator_id=indicator_id,
            threshold_id=threshold_id,
            run_id=run_id,
        )
        return {"count": len(records), "exceptions": records}

    @app.get(
        "/api/v1/exceptions/{exception_id}",
        tags=["exceptions"],
    )
    def exception_detail(
        exception_id: str,
        run_id: str | None = Query(default=None),
        repo: Any = Depends(active_repository),
    ) -> dict[str, Any]:
        """Return one exception with the audit entries that explain it."""
        detail = repo.exception_detail(exception_id, run_id=run_id)
        if detail is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No exception with the identifier {exception_id}.",
            )
        return detail

    @app.get("/api/v1/summary", tags=["summary"])
    def summary(
        reporting_period: str | None = Query(default=None),
        repo: Any = Depends(active_repository),
    ) -> dict[str, Any]:
        """Return the sector summary of one period, or of every period."""
        return repo.summary(reporting_period)

    return app

"""Load lab-run JSON into tidy pandas DataFrames.

The Node lab writes one JSON file per run set to ``data/runs`` (see
``lab/subjects/reference/assess.ts`` and ``docs/DATA_AND_TOOLS.md``). The shape is::

    {
      "kind": "lab-run",
      "target": "...",
      "metric_version": "0.1",
      "runs": [
        {
          "id": "LAB-1", "label": "...", "defects": ["..."],
          "results": {"<control>": {"status": "pass|fail",
                                    "checks": [{"id","description","expected","observed","pass"}]}},
          "score": {"lower","upper","observed","coverage","gate",
                    "criticalFailures","criticalUnknown"}
        }
      ]
    }

We validate the parts we depend on and raise :class:`LabRunSchemaError` if they are missing or the
metric version is one we have not been updated for, rather than producing silently wrong tables.
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

# Bump this (and the columns below) deliberately when the metric version changes; a new version
# means the score fields or controls may have shifted, so silent parsing would be misleading.
SUPPORTED_METRIC_VERSIONS = frozenset({"0.1"})

_SCORE_FIELDS = ("lower", "upper", "observed", "coverage", "gate")


class LabRunSchemaError(ValueError):
    """Raised when a lab-run JSON file is missing required fields or has an unexpected version."""


def _require(condition: bool, message: str) -> None:  # noqa: FBT001 - internal guard helper
    if not condition:
        raise LabRunSchemaError(message)


def load_lab_run(source: str | Path | dict) -> dict:
    """Read and validate one lab-run document from a path or an already-parsed dict."""
    if isinstance(source, dict):
        doc = source
        where = "<dict>"
    else:
        path = Path(source)
        where = str(path)
        try:
            doc = json.loads(path.read_text(encoding="utf-8"))
        except FileNotFoundError as err:
            raise LabRunSchemaError(f"{where}: file not found") from err
        except json.JSONDecodeError as err:
            raise LabRunSchemaError(f"{where}: invalid JSON ({err})") from err

    _require(isinstance(doc, dict), f"{where}: top level must be an object")
    version = doc.get("metric_version")
    _require(
        version in SUPPORTED_METRIC_VERSIONS,
        f"{where}: metric_version {version!r} is not one of {sorted(SUPPORTED_METRIC_VERSIONS)}; "
        "update piaslab.loaders before analyzing it",
    )
    _require(
        isinstance(doc.get("runs"), list) and bool(doc["runs"]),
        f"{where}: 'runs' must be a non-empty list",
    )
    for i, run in enumerate(doc["runs"]):
        _require(isinstance(run, dict), f"{where}: runs[{i}] must be an object")
        for key in ("id", "results", "score"):
            _require(key in run, f"{where}: runs[{i}] missing '{key}'")
        for field in _SCORE_FIELDS:
            _require(field in run["score"], f"{where}: runs[{i}].score missing '{field}'")
    return doc


def load_runs(source: str | Path | dict) -> pd.DataFrame:
    """One row per run: identity, seeded defects, score fields and the verdict.

    Columns: ``run_id, label, defects, n_defects, lower, upper, observed, coverage, gate,
    critical_failures, any_critical_failure, metric_version, target``.
    """
    doc = load_lab_run(source)
    rows = []
    for run in doc["runs"]:
        score = run["score"]
        defects = list(run.get("defects", []))
        crit = list(score.get("criticalFailures", []))
        rows.append(
            {
                "run_id": run["id"],
                "label": run.get("label", run["id"]),
                "defects": defects,
                "n_defects": len(defects),
                "lower": score["lower"],
                "upper": score["upper"],
                "observed": score["observed"],
                "coverage": score["coverage"],
                "gate": score["gate"],
                "critical_failures": crit,
                "any_critical_failure": bool(crit),
                "metric_version": doc["metric_version"],
                "target": doc.get("target", ""),
            }
        )
    return pd.DataFrame(rows)


def load_checks(source: str | Path | dict) -> pd.DataFrame:
    """One row per individual check outcome across all runs, tidy for grouping.

    Columns: ``run_id, control, control_status, check_id, description, expected, observed, passed``.
    """
    doc = load_lab_run(source)
    rows = []
    for run in doc["runs"]:
        for control, result in run["results"].items():
            for check in result.get("checks", []):
                rows.append(
                    {
                        "run_id": run["id"],
                        "control": control,
                        "control_status": result.get("status"),
                        "check_id": check.get("id"),
                        "description": check.get("description"),
                        "expected": check.get("expected"),
                        "observed": check.get("observed"),
                        "passed": bool(check.get("pass")),
                    }
                )
    return pd.DataFrame(rows)

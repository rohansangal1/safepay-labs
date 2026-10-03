"""Load lab-run JSON into tidy pandas DataFrames.

The Node lab writes one JSON file per run set to ``data/runs`` (see
``lab/subjects/reference/assess.ts`` and ``docs/DATA_AND_TOOLS.md``). The shape is::

    {
      "kind": "lab-run",
      "target": "...",
      "metric_version": "0.1",
      "evidence_schema_version": "1.0",
      "runs": [
        {
          "id": "LAB-1", "label": "...", "defects": ["..."],
          "results": {"<control>": {"status": "pass|fail|unknown",
                                    "records": [<evidence record>]}},
          "score": {"lower","upper","observed","coverage","gate",
                    "criticalFailures","criticalUnknown"}
        }
      ]
    }

Each evidence record (schema v1, ``packages/checks/src/evidence.ts``) carries ``check_id``,
``check_version``, ``observation_layer``, ``oracle``, ``status``, ``expected``, ``observed``,
``error`` and a ``provenance`` block that is null in committed fixtures.

We validate the parts we depend on and raise :class:`LabRunSchemaError` if they are missing or the
metric or evidence schema version is one we have not been updated for, rather than producing
silently wrong tables.
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

# Bump this (and the columns below) deliberately when the metric version changes; a new version
# means the score fields or controls may have shifted, so silent parsing would be misleading.
SUPPORTED_METRIC_VERSIONS = frozenset({"0.1"})

# Same rule for the evidence schema: a new version may rename or re-mean record fields.
# 1.1 only adds oracle values (ADR 010); the fields read here are unchanged.
SUPPORTED_EVIDENCE_SCHEMA_VERSIONS = frozenset({"1.0", "1.1"})

_RECORD_FIELDS = (
    "schema_version", "record_id", "check_id", "check_version", "observation_layer", "oracle",
    "description", "status", "expected", "observed", "error", "provenance",
)
_RECORD_STATUSES = frozenset({"pass", "fail", "unknown"})
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
    schema = doc.get("evidence_schema_version")
    _require(
        schema in SUPPORTED_EVIDENCE_SCHEMA_VERSIONS,
        f"{where}: evidence_schema_version {schema!r} is not one of "
        f"{sorted(SUPPORTED_EVIDENCE_SCHEMA_VERSIONS)}; update piaslab.loaders before analyzing it",
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
        for control, result in run["results"].items():
            at = f"{where}: runs[{i}].results.{control}"
            _require(isinstance(result.get("records"), list), f"{at} missing 'records'")
            for j, record in enumerate(result["records"]):
                for field in _RECORD_FIELDS:
                    _require(field in record, f"{at}.records[{j}] missing '{field}'")
                _require(
                    record["schema_version"] == schema,
                    f"{at}.records[{j}] schema_version differs from the document's",
                )
                _require(
                    record["status"] in _RECORD_STATUSES,
                    f"{at}.records[{j}] has invalid status {record['status']!r}",
                )
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
    """One row per evidence record (one check outcome) across all runs, tidy for grouping.

    Columns: ``run_id, control, control_status, record_id, check_id, check_version, layer, oracle,
    description, status, expected, observed, error, passed, source_commit, started_at``. The last
    two are null for committed fixtures, which carry no provenance. An errored check has status
    ``unknown`` and ``passed`` False: unknown is never a pass.
    """
    doc = load_lab_run(source)
    rows = []
    for run in doc["runs"]:
        for control, result in run["results"].items():
            for record in result["records"]:
                provenance = record["provenance"] or {}
                rows.append(
                    {
                        "run_id": run["id"],
                        "control": control,
                        "control_status": result.get("status"),
                        "record_id": record["record_id"],
                        "check_id": record["check_id"],
                        "check_version": record["check_version"],
                        "layer": record["observation_layer"],
                        "oracle": record["oracle"],
                        "description": record["description"],
                        "status": record["status"],
                        "expected": record["expected"],
                        "observed": record["observed"],
                        "error": record["error"],
                        "passed": record["status"] == "pass",
                        "source_commit": provenance.get("source_commit"),
                        "started_at": provenance.get("started_at"),
                    }
                )
    return pd.DataFrame(rows)

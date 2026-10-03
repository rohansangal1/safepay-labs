import copy
from pathlib import Path

import pytest

from piaslab.loaders import (
    LabRunSchemaError,
    load_checks,
    load_lab_run,
    load_runs,
)

REFERENCE_RUN = Path(__file__).resolve().parents[2] / "data" / "runs" / "lab-reference.json"


def test_load_runs_from_synthetic(synthetic_run):
    df = load_runs(synthetic_run)
    assert list(df["run_id"]) == ["S-0", "S-1"]
    assert df.loc[df.run_id == "S-1", "any_critical_failure"].item() is True
    assert df.loc[df.run_id == "S-0", "n_defects"].item() == 0
    assert df.loc[df.run_id == "S-1", "critical_failures"].item() == ["amount"]


def test_load_checks_from_synthetic(synthetic_run):
    df = load_checks(synthetic_run)
    assert set(df.columns) == {
        "run_id", "control", "control_status", "record_id", "check_id", "check_version",
        "layer", "oracle", "description", "status", "expected", "observed", "error", "passed",
        "source_commit", "started_at",
    }
    assert df["passed"].tolist() == [True, False]
    assert df["status"].tolist() == ["pass", "fail"]
    assert df["source_commit"].isna().all()


def test_errored_record_is_unknown_and_not_passed(synthetic_run):
    doc = copy.deepcopy(synthetic_run)
    record = doc["runs"][0]["results"]["amount"]["records"][0]
    record.update(status="unknown", expected=None, observed=None, error="subject crashed")
    df = load_checks(doc)
    assert df.loc[0, "status"] == "unknown"
    assert not df.loc[0, "passed"]


def test_provenance_is_read_when_present(synthetic_run):
    doc = copy.deepcopy(synthetic_run)
    doc["runs"][0]["results"]["amount"]["records"][0]["provenance"] = {
        "source_commit": "a" * 40,
        "started_at": "2026-10-03T10:00:00.000Z",
    }
    df = load_checks(doc)
    assert df.loc[0, "source_commit"] == "a" * 40
    assert df.loc[0, "started_at"] == "2026-10-03T10:00:00.000Z"


def test_unsupported_evidence_schema_version_is_rejected(synthetic_run):
    bad = copy.deepcopy(synthetic_run)
    bad["evidence_schema_version"] = "2.0"
    with pytest.raises(LabRunSchemaError, match="evidence_schema_version"):
        load_lab_run(bad)


def test_record_missing_a_field_is_rejected(synthetic_run):
    bad = copy.deepcopy(synthetic_run)
    del bad["runs"][0]["results"]["amount"]["records"][0]["check_version"]
    with pytest.raises(LabRunSchemaError, match="check_version"):
        load_lab_run(bad)


def test_result_without_records_is_rejected(synthetic_run):
    bad = copy.deepcopy(synthetic_run)
    del bad["runs"][0]["results"]["amount"]["records"]
    with pytest.raises(LabRunSchemaError, match="records"):
        load_lab_run(bad)


def test_unsupported_metric_version_is_rejected(synthetic_run):
    bad = copy.deepcopy(synthetic_run)
    bad["metric_version"] = "0.2"
    with pytest.raises(LabRunSchemaError, match="metric_version"):
        load_lab_run(bad)


def test_missing_score_field_is_rejected(synthetic_run):
    bad = copy.deepcopy(synthetic_run)
    del bad["runs"][0]["score"]["coverage"]
    with pytest.raises(LabRunSchemaError, match="coverage"):
        load_lab_run(bad)


def test_missing_file_is_rejected():
    with pytest.raises(LabRunSchemaError, match="file not found"):
        load_lab_run("does-not-exist.json")


@pytest.mark.skipif(not REFERENCE_RUN.exists(), reason="reference run file not present")
def test_reads_the_committed_reference_run():
    runs = load_runs(REFERENCE_RUN)
    checks = load_checks(REFERENCE_RUN)
    # The baseline plus one run per seeded defect; every run carries a verdict.
    assert (runs["run_id"] == "LAB-0").any()
    assert runs["gate"].notna().all()
    # Each seeded-defect run has at least one failing check.
    seeded = runs[runs.n_defects > 0]["run_id"]
    for run_id in seeded:
        assert not checks[(checks.run_id == run_id) & (~checks.passed)].empty

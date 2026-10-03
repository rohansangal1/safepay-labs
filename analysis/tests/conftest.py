import pytest

REPO_ROOT_MARKER = "package.json"


def _record(run_id: str, expected: int, observed: int) -> dict:
    """One evidence record (schema v1) as the Node runner writes it for a committed fixture."""
    return {
        "schema_version": "1.0",
        "record_id": f"{run_id}/a1@1",
        "run_id": run_id,
        "subject_id": "synthetic",
        "authorization_id": "owned-lab",
        "control_id": "amount",
        "check_id": "a1",
        "check_version": 1,
        "registry_version": "1",
        "metric_version": "0.1",
        "evidence_schema_version": "1.0",
        "observation_layer": "http-api",
        "oracle": "http-response",
        "description": "d",
        "status": "pass" if expected == observed else "fail",
        "expected": expected,
        "observed": observed,
        "error": None,
        "review_state": "automated",
        "provider": None,
        "provider_api_version": None,
        "artifact_sha256": None,
        "redaction_policy": "allowlist-v1",
        "redactions": [],
        "provenance": None,
    }


@pytest.fixture
def synthetic_run() -> dict:
    """A minimal but schema-valid lab-run document for tests that need no external data."""
    return {
        "kind": "lab-run",
        "target": "synthetic",
        "metric_version": "0.1",
        "evidence_schema_version": "1.0",
        "runs": [
            {
                "id": "S-0",
                "label": "Baseline",
                "defects": [],
                "results": {
                    "amount": {
                        "status": "pass",
                        "evidence": "synthetic",
                        "records": [_record("S-0", 1, 1)],
                    },
                },
                "score": {
                    "lower": 65,
                    "upper": 100,
                    "observed": 100.0,
                    "coverage": 65,
                    "gate": "insufficient-evidence",
                    "criticalFailures": [],
                    "criticalUnknown": [],
                },
            },
            {
                "id": "S-1",
                "label": "Seeded",
                "defects": ["trustClientAmount"],
                "results": {
                    "amount": {
                        "status": "fail",
                        "evidence": "synthetic",
                        "records": [_record("S-1", 5000, 2)],
                    },
                },
                "score": {
                    "lower": 50,
                    "upper": 85,
                    "observed": 76.9,
                    "coverage": 65,
                    "gate": "critical-failure",
                    "criticalFailures": ["amount"],
                    "criticalUnknown": [],
                },
            },
        ],
    }

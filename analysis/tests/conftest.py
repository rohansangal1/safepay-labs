import pytest

REPO_ROOT_MARKER = "package.json"


@pytest.fixture
def synthetic_run() -> dict:
    """A minimal but schema-valid lab-run document for tests that need no external data."""
    return {
        "kind": "lab-run",
        "target": "synthetic",
        "metric_version": "0.1",
        "runs": [
            {
                "id": "S-0",
                "label": "Baseline",
                "defects": [],
                "results": {
                    "amount": {
                        "status": "pass",
                        "evidence": "synthetic",
                        "checks": [
                            {"id": "a1", "description": "d", "expected": 1, "observed": 1, "pass": True},  # noqa: E501
                        ],
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
                        "checks": [
                            {"id": "a1", "description": "d", "expected": 5000, "observed": 2, "pass": False},  # noqa: E501
                        ],
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

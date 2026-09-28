"""Analysis for the Payment Integration Lab.

Reads the lab-run JSON in ``data/runs`` and computes prevalence statistics. This package never
writes into ``data/runs``; it only reads what the Node lab produces.
"""

from piaslab.bootstrap import BootstrapResult, cluster_bootstrap_prevalence
from piaslab.loaders import (
    SUPPORTED_METRIC_VERSIONS,
    LabRunSchemaError,
    load_checks,
    load_lab_run,
    load_runs,
)

__all__ = [
    "BootstrapResult",
    "LabRunSchemaError",
    "SUPPORTED_METRIC_VERSIONS",
    "cluster_bootstrap_prevalence",
    "load_checks",
    "load_lab_run",
    "load_runs",
]

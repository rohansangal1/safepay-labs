"""Analysis for SafePay Labs.

Reads the lab-run JSON in ``data/runs`` and computes prevalence statistics. This package never
writes into ``data/runs``; it only reads what the Node lab produces.
"""

from piaslab.bootstrap import BootstrapResult, cluster_bootstrap_prevalence
from piaslab.library import (
    THEMES,
    load_library,
    tag_themes,
    term_frequency,
    theme_cooccurrence,
    theme_counts,
    top_theme_pairs,
)
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
    "THEMES",
    "cluster_bootstrap_prevalence",
    "load_checks",
    "load_lab_run",
    "load_library",
    "load_runs",
    "tag_themes",
    "term_frequency",
    "theme_cooccurrence",
    "theme_counts",
    "top_theme_pairs",
]

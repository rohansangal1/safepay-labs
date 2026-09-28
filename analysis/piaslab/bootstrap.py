"""Seeded cluster bootstrap for prevalence confidence intervals.

The study's units are not independent: many subjects share an ``agent x prompt`` (or, in the
reframed design, an architecture family) cluster, so a naive per-subject bootstrap understates
uncertainty. This resamples whole clusters with replacement (a cluster bootstrap), which is what
the analysis plan in ``docs/RESEARCH_PLAN.md`` calls for.

The estimator is prevalence: the fraction of subjects where ``outcome`` is true (e.g. any harm).
Results are reproducible from ``seed``.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class BootstrapResult:
    """Point estimate and a percentile confidence interval from a cluster bootstrap."""

    estimate: float
    low: float
    high: float
    level: float
    n_clusters: int
    n_subjects: int
    n_resamples: int

    def as_dict(self) -> dict:
        return {
            "estimate": self.estimate,
            "low": self.low,
            "high": self.high,
            "level": self.level,
            "n_clusters": self.n_clusters,
            "n_subjects": self.n_subjects,
            "n_resamples": self.n_resamples,
        }


def cluster_bootstrap_prevalence(
    data: pd.DataFrame,
    outcome: str,
    cluster: str,
    *,
    n_resamples: int = 10_000,
    level: float = 0.95,
    seed: int = 0,
) -> BootstrapResult:
    """Prevalence of ``outcome`` with a cluster-bootstrap percentile interval.

    ``data`` has one row per subject. ``outcome`` is a boolean-like column; ``cluster`` names the
    resampling unit. Each replicate draws whole clusters with replacement (as many as there are in
    the data), pools their subjects, and recomputes the mean outcome. The interval is the
    percentile interval of those replicate means.
    """
    if outcome not in data.columns:
        raise KeyError(f"outcome column {outcome!r} not in data")
    if cluster not in data.columns:
        raise KeyError(f"cluster column {cluster!r} not in data")
    if not 0 < level < 1:
        raise ValueError(f"level must be in (0, 1), got {level}")
    if data.empty:
        raise ValueError("data is empty")

    outcomes = data[outcome].to_numpy(dtype=float)
    point = float(outcomes.mean())

    # Group subject outcomes by cluster once, then resample the groups.
    groups = [grp[outcome].to_numpy(dtype=float) for _, grp in data.groupby(cluster, sort=True)]
    n_clusters = len(groups)
    rng = np.random.default_rng(seed)

    replicates = np.empty(n_resamples, dtype=float)
    for i in range(n_resamples):
        picks = rng.integers(0, n_clusters, size=n_clusters)
        pooled = np.concatenate([groups[j] for j in picks])
        replicates[i] = pooled.mean()

    alpha = 1.0 - level
    low, high = np.quantile(replicates, [alpha / 2.0, 1.0 - alpha / 2.0])
    return BootstrapResult(
        estimate=point,
        low=float(low),
        high=float(high),
        level=level,
        n_clusters=n_clusters,
        n_subjects=int(len(data)),
        n_resamples=n_resamples,
    )

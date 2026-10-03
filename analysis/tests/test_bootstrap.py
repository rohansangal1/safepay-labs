import numpy as np
import pandas as pd
import pytest

from piaslab.bootstrap import cluster_bootstrap_prevalence


def _make(
    prevalence_by_cluster: dict[str, float], per_cluster: int = 20, seed: int = 1
) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    rows = []
    for cluster, p in prevalence_by_cluster.items():
        for _ in range(per_cluster):
            rows.append({"cluster": cluster, "harm": bool(rng.random() < p)})
    return pd.DataFrame(rows)


def test_estimate_matches_mean_and_interval_brackets_it():
    data = _make({"a": 0.2, "b": 0.5, "c": 0.8})
    res = cluster_bootstrap_prevalence(data, "harm", "cluster", n_resamples=2000, seed=0)
    assert res.estimate == pytest.approx(data["harm"].mean())
    assert res.low <= res.estimate <= res.high
    assert res.n_clusters == 3
    assert res.n_subjects == 60


def test_is_reproducible_with_seed():
    data = _make({"a": 0.3, "b": 0.6})
    a = cluster_bootstrap_prevalence(data, "harm", "cluster", n_resamples=1000, seed=42)
    b = cluster_bootstrap_prevalence(data, "harm", "cluster", n_resamples=1000, seed=42)
    assert (a.low, a.high, a.estimate) == (b.low, b.high, b.estimate)


def test_clustering_widens_interval_versus_ignoring_it():
    # Strong between-cluster differences: treating clusters as the unit should give a wider
    # interval than pretending every subject is its own cluster.
    data = _make({"a": 0.05, "b": 0.95}, per_cluster=40, seed=7)
    clustered = cluster_bootstrap_prevalence(data, "harm", "cluster", n_resamples=3000, seed=0)

    per_subject = data.copy()
    per_subject["subject"] = range(len(per_subject))
    naive = cluster_bootstrap_prevalence(per_subject, "harm", "subject", n_resamples=3000, seed=0)

    assert (clustered.high - clustered.low) > (naive.high - naive.low)


def test_all_true_gives_prevalence_one():
    data = pd.DataFrame({"cluster": ["a", "a", "b", "b"], "harm": [True, True, True, True]})
    res = cluster_bootstrap_prevalence(data, "harm", "cluster", n_resamples=500, seed=0)
    assert res.estimate == 1.0
    assert res.low == 1.0 and res.high == 1.0


def test_missing_columns_raise():
    data = pd.DataFrame({"cluster": ["a"], "harm": [True]})
    with pytest.raises(KeyError):
        cluster_bootstrap_prevalence(data, "nope", "cluster")
    with pytest.raises(KeyError):
        cluster_bootstrap_prevalence(data, "harm", "nope")

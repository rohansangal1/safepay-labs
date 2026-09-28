from pathlib import Path

import pytest

from piaslab.library import (
    load_library,
    tag_themes,
    theme_cooccurrence,
    theme_counts,
    top_theme_pairs,
)

LIBRARY = Path(__file__).resolve().parents[2] / "data" / "library.json"

SAMPLE = [
    {
        "id": "arxiv:1", "status": "included", "category": "Paper", "source": "Preprint 2026",
        "title": "Webhook replay attacks on checkout",
        "note": "Payment logic flaws via forged webhooks.", "url": "u1",
    },
    {
        "id": "std:1", "status": "included", "category": "Standard", "source": "PCI SSC",
        "title": "SAQ A eligibility", "note": "PCI DSS scope for embedded forms.", "url": "u2",
    },
    {
        "id": "law:1", "status": "included", "category": "Ethics & law", "source": "US DOJ 2022",
        "title": "CFAA charging policy", "note": "Good-faith research authorization, not immunity.",
        "url": "u3",
    },
]


def test_load_derives_year_and_research_flag():
    df = load_library(SAMPLE)
    assert df.loc[0, "year"] == 2026
    assert df["year"].dtype == "Int64"
    assert bool(df.loc[0, "is_research"]) is True
    assert bool(df.loc[1, "is_research"]) is False


def test_theme_tagging_and_counts():
    tagged = tag_themes(load_library(SAMPLE))
    row = tagged.loc[0]
    assert row["Payments & checkout"]
    assert row["Webhooks & signatures"]
    assert row["Logic & multi-party flaws"]
    assert tagged.loc[1, "PCI & payment compliance"]
    assert tagged.loc[2, "Ethics, law & disclosure"]
    counts = theme_counts(tagged)
    assert counts["Payments & checkout"] >= 1


def test_cooccurrence_is_symmetric_and_diagonal_is_theme_count():
    tagged = tag_themes(load_library(SAMPLE))
    mat = theme_cooccurrence(tagged)
    assert (mat.values == mat.values.T).all()
    assert mat.loc["Payments & checkout", "Payments & checkout"] == int(
        tagged["Payments & checkout"].sum()
    )


def test_top_pairs_returns_positive_counts():
    tagged = tag_themes(load_library(SAMPLE))
    for a, b, c in top_theme_pairs(tagged):
        assert a != b and c > 0


@pytest.mark.skipif(not LIBRARY.exists(), reason="library.json not present")
def test_reads_committed_library():
    df = load_library(LIBRARY)
    assert len(df) >= 20
    tagged = tag_themes(df)
    # Every empirical/industry source must land on at least one theme.
    assert (tagged[tagged["is_research"]]["n_themes"] >= 1).all()
    # A few generic provider/standard docs may not; most sources should still be tagged.
    assert (tagged["n_themes"] >= 1).mean() >= 0.85

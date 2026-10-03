"""Exploratory analysis of the research library (``data/library.json``).

This is **bibliometric and thematic** analysis over the curated library metadata (category, venue,
year and the project's one-line ``note`` per source, plus ``abstract`` when the daily updater has
one). It does not extract findings from full texts; the ``note`` field is the project's own
summary of each source. Use it to see the shape of the literature — what areas are covered, how
sources cluster and where they intersect — not as a substitute for reading the papers.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

import pandas as pd

# Theme -> keywords/phrases. Matched case-insensitively on word boundaries against
# title + note + abstract. A source may carry several themes; that overlap is the point.
THEMES: dict[str, tuple[str, ...]] = {
    "Payments & checkout": (
        "payment", "payments", "checkout", "cashier", "fulfillment", "merchant",
        "e-commerce", "ecommerce", "order", "refund", "cashback",
    ),
    "Webhooks & signatures": (
        "webhook", "webhooks", "signature", "signatures", "hmac", "notification",
    ),
    "AI code generation & agents": (
        "coding agent", "coding agents", "code generation", "generated code", "llm", "llms",
        "language model", "ai agent", "ai agents", "ai-generated",
    ),
    "Agentic commerce & protocols": (
        "agentic commerce", "agent payment", "agent payments", "agentic payments", "ap2",
        "protocol", "autonomous",
    ),
    "Logic & multi-party flaws": (
        "logic flaw", "logic flaws", "business logic", "multi-party", "replay", "attack",
        "attacks", "exploit", "exploits", "vulnerability", "vulnerabilities", "state",
    ),
    "Backends & benchmarks": ("benchmark", "benchmarks", "backend", "backends", "secure"),
    "PCI & payment compliance": ("pci", "dss", "saq", "psd2", "sca", "compliance"),
    "Ethics, law & disclosure": (
        "cfaa", "gdpr", "irb", "ethics", "ethical", "disclosure", "authorization",
        "privacy", "consent",
    ),
    "Browser & observability": (
        "browser", "playwright", "network", "opentelemetry", "trace", "traces", "observability",
    ),
    "Standards & severity": ("cvss", "owasp", "wstg", "standard", "standards", "severity"),
}

# Empirical/primary sources whose findings we may cite, vs supporting references (docs/standards).
RESEARCH_CATEGORIES = frozenset({"Paper", "Industry"})

_STOPWORDS = frozenset(
    """a an and are as at be by for from how in into is it its not of on or the this to via
    with we our their they can does do done not no than then that these those what when which
    security secure using use used toward towards based study analysis""".split()
)
_WORD = re.compile(r"[a-z][a-z0-9+-]{2,}")
_YEAR = re.compile(r"(19|20)\d{2}")


def load_library(source: str | Path | list) -> pd.DataFrame:
    """Load ``data/library.json`` into one row per entry, with derived year and text fields.

    Columns: ``id, status, category, source, title, note, url, abstract, year, is_research, text``.
    """
    if isinstance(source, list):
        entries = source
    else:
        entries = json.loads(Path(source).read_text(encoding="utf-8"))
    if not isinstance(entries, list):
        raise ValueError("library must be a JSON array")

    rows = []
    for e in entries:
        year_match = _YEAR.search(e.get("source", ""))
        abstract = e.get("abstract", "")
        note = e.get("note", "")
        rows.append(
            {
                "id": e.get("id", ""),
                "status": e.get("status", ""),
                "category": e.get("category", ""),
                "source": e.get("source", ""),
                "title": e.get("title", ""),
                "note": note,
                "url": e.get("url", ""),
                "abstract": abstract,
                "year": int(year_match.group(0)) if year_match else pd.NA,
                "is_research": e.get("category", "") in RESEARCH_CATEGORIES,
                # Source/venue (e.g. "OWASP", "PCI SSC") carries theme signal too.
                "text": " ".join([e.get("title", ""), e.get("source", ""), note, abstract]).strip(),
            }
        )
    df = pd.DataFrame(rows)
    df["year"] = df["year"].astype("Int64")
    return df


def _has_theme(text: str, keywords: tuple[str, ...]) -> bool:
    # Normalize hyphens to spaces so "coding-agent" matches the keyword "coding agent"
    # and "e-commerce" matches "e commerce".
    low = text.lower().replace("-", " ")
    return any(re.search(rf"\b{re.escape(k.replace('-', ' '))}\b", low) for k in keywords)


def tag_themes(df: pd.DataFrame) -> pd.DataFrame:
    """Add one boolean column per theme, plus ``themes`` (list) and ``n_themes``."""
    out = df.copy()
    for theme, keywords in THEMES.items():
        out[theme] = out["text"].apply(lambda t, kw=keywords: _has_theme(t, kw))
    theme_cols = list(THEMES)
    out["themes"] = out[theme_cols].apply(lambda row: [t for t in theme_cols if row[t]], axis=1)
    out["n_themes"] = out[theme_cols].sum(axis=1)
    return out


def theme_counts(tagged: pd.DataFrame) -> pd.Series:
    """How many sources carry each theme, most common first."""
    counts = {theme: int(tagged[theme].sum()) for theme in THEMES}
    return pd.Series(counts).sort_values(ascending=False)


def theme_cooccurrence(tagged: pd.DataFrame) -> pd.DataFrame:
    """Symmetric theme x theme matrix; cell = number of sources carrying both themes."""
    themes = list(THEMES)
    mat = pd.DataFrame(0, index=themes, columns=themes, dtype=int)
    for _, row in tagged.iterrows():
        present = [t for t in themes if row[t]]
        for a in present:
            for b in present:
                mat.loc[a, b] += 1
    return mat


def top_theme_pairs(tagged: pd.DataFrame, n: int = 8) -> list[tuple[str, str, int]]:
    """The most frequent distinct theme intersections, as (theme_a, theme_b, count)."""
    mat = theme_cooccurrence(tagged)
    themes = list(THEMES)
    pairs = [
        (themes[i], themes[j], int(mat.iloc[i, j]))
        for i in range(len(themes))
        for j in range(i + 1, len(themes))
        if mat.iloc[i, j] > 0
    ]
    pairs.sort(key=lambda p: p[2], reverse=True)
    return pairs[:n]


def term_frequency(df: pd.DataFrame, n: int = 20) -> pd.Series:
    """Most common content words across title + note + abstract, stopwords removed."""
    counter: Counter[str] = Counter()
    for text in df["text"]:
        for token in _WORD.findall(text.lower()):
            if token not in _STOPWORDS:
                counter[token] += 1
    return pd.Series(dict(counter.most_common(n)))

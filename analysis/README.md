# Analysis

Python analysis for SafePay Labs. It **reads** the JSON that the Node lab writes
to `../data/runs/` and never writes back into it: data flows one way (Node → `data/runs` → Python).

## Setup
Requires [uv](https://docs.astral.sh/uv/) and Python 3.12 (`.python-version` pins it).

```sh
cd analysis
uv sync            # create .venv and install locked deps
uv run ruff check  # lint
uv run pytest      # tests
```

## Layout
- `piaslab/loaders.py` — load `data/runs/*.json` lab runs into tidy pandas DataFrames, with a
  schema guard that fails loudly if the run format changes.
- `piaslab/bootstrap.py` — seeded cluster bootstrap for prevalence confidence intervals.
- `tests/` — pytest over the above using a synthetic fixture; no network, no external data.

Notebooks are for exploration only. Do not commit notebooks with output cells.

## Library exploratory analysis
Bibliometric/thematic view of `data/library.json` — coverage, timeline, themes and their
intersections — regenerated on demand (outputs are git-ignored, like the site build):

```sh
uv run python -m piaslab.library_report   # → analysis/reports/library/
```

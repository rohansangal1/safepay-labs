# 008. Public landing page and researcher-only portal

- **Status:** Accepted, 2026-10-01
- **Amends:** [006](006-public-site-and-publishing.md) (the site is split in two; hosting is no longer purely static) and [003](003-dependencies-and-layout.md) (adds a Python `portal/` package with pinned dependencies).

## Context
ADR 006 made `site/` the public face of the project but kept it private until results are reviewed for release. That left nothing an everyday reader could see, and the only protection for the research views was Vercel's own login in front of every deployment. We want a public page that explains the idea, mission and roadmap now, while results, the benchmark explorer, the library and milestone detail stay with the researchers.

## Decision
- **`public/` is the public site**: a static landing page for a general reader. It carries no results. Its only data is `public/data/roadmap.json`, phase-level progress derived by `npm run build:site`. The publishing rules in ADR 006 still govern anything added to it.
- **`site/` is the researcher portal.** It is no longer in the static output, so the CDN cannot serve it. `api/portal.py` is the only route to its files and checks credentials before returning anything.
- **No sign-in page.** Access uses HTTP Basic: the browser's own prompt asks for an email and password. Researchers are created from the terminal (`npm run researcher -- add <email>`), which prints a generated password once. There is no self-service sign-up or reset.
- **Accounts live in Postgres** (Neon, through the Vercel Marketplace): one `researchers` row each, holding an Argon2id hash and never the password.
- **The access layer is Python** (`portal/`): `argon2-cffi` for hashing, FastAPI for the gate, `psycopg` for Postgres, versions fixed by the root `uv.lock`. `packages/` stays zero-dependency.
- **Failed attempts are limited** to 10 per email and per client address in 15 minutes; counters are keyed by a hash, so no raw addresses are stored.
- **Images are stored in the repository**, never hot-linked, with their origin and licence in `public/assets/SOURCES.md`. Provider logos name the formats we plan to emulate and sit next to a no-affiliation statement.

## Consequences
- Hosting is static files plus one function and one database. `npm run site` now needs `uv`.
- Basic auth has no real sign-out (close the browser) and resends the password on every request, so it is only acceptable over HTTPS and for a handful of people. Revisit if the group grows or needs per-person permissions.
- A warm function trusts a credential it has just verified for 60 seconds, so disabling an account or changing a password takes up to a minute to bite.
- The per-email limit means anyone who knows a researcher's email can lock that account for 15 minutes by guessing badly. Accepted for now.
- Vercel Deployment Protection must be off for production so the landing page is reachable, and stays on for previews.
- The root `pyproject.toml` belongs to the portal, because that is where Vercel's Python runtime reads dependencies. `analysis/` keeps its own environment.

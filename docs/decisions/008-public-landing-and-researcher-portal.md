# 008. Public landing page and researcher-only portal

- **Status:** Accepted, 2026-10-01
- **Amends:** [006](006-public-site-and-publishing.md) (the site is split in two; hosting is no longer purely static) and [003](003-dependencies-and-layout.md) (adds a Python `portal/` package with pinned dependencies).

## Context
ADR 006 made `site/` the public face of the project but kept it private until results are reviewed for release. That left nothing an everyday reader could see, and the only protection for the research views was Vercel's own login in front of every deployment. We want a public page that explains the idea, mission and roadmap now, while results, the benchmark explorer, the library and milestone detail stay with the researchers.

## Decision
- **`public/` is the public site**: a static landing page for a general reader. It carries no results. Its only data is `public/data/roadmap.json`, phase-level progress derived by `npm run build:site`. The publishing rules in ADR 006 still govern anything added to it.
- **`site/` is the researcher portal.** It is no longer in the static output, so the CDN cannot serve it. `api/portal.py` is the only route to its files, at `/devs/`, and returns them only to a signed-in browser.
- **Sign in once per browser.** `/devs/` shows a sign-in form to anyone without a session. A correct email and password sets a session cookie (`HttpOnly`, `Secure`, `SameSite=Lax`, scoped to `/devs`) that lasts 90 days and is renewed on use, so an active researcher is not asked again. The first draft of this decision used the browser's HTTP Basic pop-up; it was replaced the same day because it re-asked too often and could not sign out.
- **Accounts are made by an admin.** There is no self-service sign-up or reset. Admins manage accounts on a page at `/devs/admin` (add, new password, sign out everywhere, disable, remove, make admin); a generated password is shown once. The terminal tool (`npm run researcher`) does the same against the database and is how the first admin is made.
- **The admin page is defended in layers.** It answers 404 to anyone who is not an admin. It re-reads the session from the database on every request, with no cached trust. It asks for the admin's password again after 12 hours, so about once a working day. Every change needs a token tied to the session cookie and a same-site `Origin` header. Admins cannot disable, remove or demote themselves. Every change is written to an audit log shown on the page.
- **Accounts live in Postgres** (Neon, through the Vercel Marketplace): one `researchers` row each, holding an Argon2id hash and never the password, plus a `sessions` table that stores only a hash of each cookie.
- **The access layer is Python** (`portal/`): `argon2-cffi` for hashing, FastAPI for the gate, `psycopg` for Postgres, versions fixed by the root `uv.lock`. `packages/` stays zero-dependency.
- **Failed attempts are limited** to 10 per email and per client address in 15 minutes; counters are keyed by a hash, so no raw addresses are stored.
- **Images are stored in the repository**, never hot-linked, with their origin and licence in `public/assets/SOURCES.md`. Provider logos name the formats we plan to emulate and sit next to a no-affiliation statement.

## Consequences
- Hosting is static files plus one function and one database. `npm run site` now needs `uv`.
- A stolen session cookie works until it expires or is ended; on its own it cannot change accounts, because the admin page wants the password again. `Sign out` ends one browser; `npm run researcher -- signout <email>`, `passwd`, `disable` and `remove` end all of that researcher's sessions. Form posts from another site are refused by an `Origin` check. Revisit the design if the group grows or needs per-person permissions.
- A warm function trusts a session it has just checked for 60 seconds, so disabling an account, changing a password or signing someone out takes up to a minute to bite.
- The per-email limit means anyone who knows a researcher's email can lock that account for 15 minutes by guessing badly. Accepted for now.
- Vercel Deployment Protection must be off for production so the landing page is reachable, and stays on for previews.
- The root `pyproject.toml` belongs to the portal, because that is where Vercel's Python runtime reads dependencies. `analysis/` keeps its own environment.

# Repository setup

Remote: https://github.com/rohansangal1/payment-integration-lab. Keep it private until the first public release is reviewed ([ADR 006](decisions/006-public-site-and-publishing.md)). License: Apache-2.0 ([ADR 005](decisions/005-license.md)).

## Included
- CI (`.github/workflows/ci.yml`) on Node 22 and 24: `npm ci`, type check, tests, and a generated-files check that fails if `data/runs` or the site's copies are stale.
- Library update (`.github/workflows/library.yml`) daily and on demand: opens or updates a `library-updates` pull request.
- All actions pinned to full commit SHAs with the release tag in a comment. Update them deliberately, e.g. with Dependabot for `github-actions`.
- Issue templates (bug, research change) with a private route for security reports; PR template.

## Settings to turn on (manual, in GitHub → Settings)
These are recommendations, not yet configured:
1. **Branch protection on `main`:** require a pull request and passing *Research checks*; block force pushes.
2. **Private vulnerability reporting** (Security → Advisories). The issue template links to it, and the link doesn't work until this is enabled.
3. **Secret scanning and push protection.**
4. **Dependabot** alerts and version updates for `npm` and `github-actions`.
5. **Let the library job open pull requests:** Actions → General → Workflow permissions → *Allow GitHub Actions to create and approve pull requests*.
6. **Optional `S2_API_KEY` secret** (free key from Semantic Scholar) so the daily citation search isn't rate-limited.

## Backlog
The roadmap lives in [RESEARCH_PLAN.md](RESEARCH_PLAN.md#milestones-and-exit-gates) and on the site (`site/data/milestones.json`). Create one GitHub milestone per phase (0–5) and issues for the items in each. No external assessment job may run automatically on pull requests; fork PRs must never receive provider secrets. Sandbox runs use dedicated test accounts and a manual, protected workflow.

# SafePay Labs

**Which payment-integration designs actually prevent money-level harm?** This project measures it. Owned Stripe and Square checkout variants, each in its own sealed container, are attacked with forged, replayed and mismatched payment events, with security layers switched on and off. The damage is measured in money and order state, and each integration is scored with **PIAS**, an evidence-aware assurance score that keeps unchecked controls visible instead of counting them as passes.

Status: research in progress, targeting a preprint. PIAS v0.1 is a draft metric, not a PCI assessment or a probability of compromise. The results will feed integration guidance for developers and their coding agents, and an open-source tool for end-to-end payment testing without real card data. See the [research plan](docs/RESEARCH_PLAN.md).

## Repository layout
| Path | What's there | Dependencies |
|---|---|---|
| `packages/core/` | PIAS score engine and control catalog | None (runtime) |
| `packages/checks/` | Versioned check registry, `SubjectAdapter` interface and runner | None (runtime) |
| `packages/oracle/` | Harm oracle: end-to-end scenarios that measure money and state outcomes; never feeds the score | None (runtime) |
| `lab/emulator/` | Fake payment provider: event builder and HMAC webhook signing | None so far |
| `lab/subjects/reference/` | Local reference checkout, its adapter, 17 seeded defects | None so far |
| `data/runs/` | Assessment results (generated) | |
| `public/` | Public landing page (static) | |
| `site/` | Researcher portal (sign-in required) | |
| `portal/`, `api/` | Portal access layer: gate, accounts, CLI (Python) | Pinned (`uv.lock`) |
| `scripts/` | Build helpers | |
| `docs/` | Protocol, metric, literature, safety, [decisions](docs/decisions/README.md) | |

Planned: `lab/subjects/variants/` (architecture variants), container isolation, and an open-source testing tool starting as `packages/cli` (zero-dependency). See [ADR 003](docs/decisions/003-dependencies-and-layout.md).

## Setup
Requires **Node.js 22.13+** (24 recommended, see `.nvmrc`) and [uv](https://docs.astral.sh/uv/) for the local site server. No provider keys are needed.

```sh
npm ci
npm test              # engine and reference-checkout tests
npm run typecheck     # TypeScript type check (Node runs the .ts files directly)
npm run assess        # assess the reference checkout → data/runs/lab-reference.json
npm run site          # build and serve the site at http://127.0.0.1:4173
npm run library:update  # search for new related work → data/library.json (also runs daily in CI)
```

The code is TypeScript that Node runs directly through type stripping. `.npmrc` enables it for every npm script, so there's no build step ([ADR 004](docs/decisions/004-typescript-type-stripping.md)).

## Analysis (Python)
Statistics live in [`analysis/`](analysis/), managed by [uv](https://docs.astral.sh/uv/) with Python 3.12. It **reads** the run JSON in `data/runs/` and never writes back — data flows one way (Node → `data/runs` → Python).

```sh
cd analysis
uv sync            # create .venv from the committed uv.lock
uv run ruff check
uv run pytest
```

`piaslab.loaders` turns lab runs into tidy DataFrames (and fails loudly if the run format changes); `piaslab.bootstrap` is the seeded cluster bootstrap for prevalence intervals. Notebooks are for exploration only — don't commit them with output cells.

## Research library
`data/library.json` holds every related paper and primary source, one per line. Each has a `status`: `included` (with a `note`), `candidate` (found automatically, not yet screened) or `excluded` (with a `reason`, kept so it's never suggested again). `.github/workflows/library.yml` runs daily. It searches arXiv for the topics in `data/library-queries.json` and looks for papers citing entries marked `track_citations`. It also flags new versions of included preprints and dead links, then opens or updates one pull request with the changes. Nothing becomes `included` without a person deciding. `npm run build:site` rejects an invalid library.

## The website
There are two halves ([ADR 008](docs/decisions/008-public-landing-and-researcher-portal.md)):

- **`public/`** is the public landing page: the idea and the mission. No results and no roadmap; those stay in the portal.
- **`site/`** is the researcher portal at `/devs/`. It is never served as a static file; a small Python function shows a sign-in form and returns the portal only to a signed-in browser. You sign in once per browser and stay signed in. Admins create and remove accounts on a page at `/devs/admin`.

**Researchers: [docs/PORTAL_ACCESS.md](docs/PORTAL_ACCESS.md) is the full guide** to getting an account, signing in, creating accounts for others and handling the password.

`npm run site` copies the engine and the latest results into `site/`, then serves both halves at `http://127.0.0.1:4173` with a local-only login that it prints at start. Press `Ctrl+C` to stop.

| File | Controls |
|---|---|
| `site/data/milestones.json` | Roadmap board and progress (`not-started`, `in-progress`, `done`) |
| `data/library.json` | Research library: the project's knowledge base (copied to the site on build) |

`site/score.js`, `site/data/controls.json` and `site/data/assessments.json` are generated by `npm run build:site`. Don't edit them. The site's F-fixtures are synthetic illustrations; lab runs are real checks against the reference checkout.

## Reference checkout
`lab/subjects/reference/` is a small local checkout with a catalog, orders, payments and fulfillment records. It binds to 127.0.0.1 only and makes no outbound calls. There's no real provider, money or card data. It calibrates the checks: a known-good subject plus variants with one safeguard removed.

State lives in `node:sqlite`. A verified success event records the payment and a fulfillment job in one transaction; the job then runs from that outbox. If fulfillment fails or the process stops, the job stays pending and runs on the next event or restart. Unique indexes allow one fulfillment per order, however many events arrive. A full refund reverses the fulfillment and blocks a success event that arrives late, and `reconcile()` asks the provider about orders whose event never arrived. Every payment and order state change, and every rejected webhook, writes a row to an append-only `audit` table in the same transaction. Log lines carry IDs and outcomes only, never a payload or the webhook secret.

`npm run assess` runs the 30 registered checks in `packages/checks` through the checkout's `SubjectAdapter` ([adapter.ts](lab/subjects/reference/adapter.ts)). They map to eleven PIAS controls (amount, binding, authenticity, fulfillment, authorization, idempotency, lifecycle, recovery, secrets, data minimization, audit). Each check is versioned and records its observation layer and oracle; the webhook checks read the checkout's fulfillment records, not its HTTP responses. The secrets, data and audit checks read what the checkout leaves behind (responses, log lines, stored rows, audit trail) and cover that runtime evidence only. A check that can't run leaves its control unknown, never passed. The baseline passes all eleven and is rated *assessed* with a range of 95–100; browser integrity has no checks yet and stays unknown. Each of the seventeen seeded defects (`DEFECTS` in `app.ts`) is caught by its own control and no other, and the tests enforce this.

`npm run harm` runs the harm oracle (`packages/oracle`, [ADR 002](docs/decisions/002-harm-oracle.md)) and writes `data/harm/lab-reference.json`. It is separate from the checks and never feeds the score. Twelve end-to-end scenarios (an honest purchase, a tampered price, a forged event, a retry storm, a refund, an outage, a dropped webhook and others) play out against a fresh checkout each. Afterwards the oracle compares the fake provider's ledger (what was captured and refunded) with the checkout's fulfillment records and reports five harms: underpayment, double fulfillment, cross-account access, lost order and inconsistent refund. The baseline shows none. The eleven defects in the money path each cause one kind of harm; the six leak and audit defects cause none, because they move no money on their own.

To explore by hand:
```sh
LAB_WEBHOOK_SECRET=devsecret npm run checkout            # http://127.0.0.1:4280
curl -X POST localhost:4280/orders -H 'x-lab-customer: alice' \
  -H 'content-type: application/json' -d '{"items":[{"sku":"lab-mug","qty":2}]}'
LAB_WEBHOOK_SECRET=devsecret npm run checkout:event -- ord_0001 alice
curl localhost:4280/orders/ord_0001 -H 'x-lab-customer: alice'   # status: fulfilled
```
Add `LAB_DEFECTS=skipSignature` (comma-separated) to start it with a seeded defect. Add `LAB_DB=work/checkout.db` to keep state across restarts (`work/` is git-ignored).

## Contributing, security and license
See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). Nothing here authorizes testing systems you don't own. Licensed under [Apache-2.0](LICENSE). To cite, see [CITATION.cff](CITATION.cff).

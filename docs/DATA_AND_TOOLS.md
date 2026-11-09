# Dataset and tooling design

## Dataset units
Distinguish subject, run, check, harm scenario and finding. A **subject** is one runnable integration: an owned architecture variant, an open-source shop or a calibration variant of the reference checkout (see [RESEARCH_PLAN.md](RESEARCH_PLAN.md#subjects)). The site's 12 synthetic F-fixtures are illustrative labels, not subjects.

Each subject carries its source (variant, open-source or calibration), provider, checkout architecture, fulfillment trigger, enabled security layers and split. Each run adds commit SHA, dependency lock hash, provider API/SDK versions, instrument version, metric version, scope authorization ID/expiry, collection start/end, infrastructure version, navigation outcome and exclusion reason. Keep unit identifiers stable across reruns.

**Track B units** ([ADR 011](decisions/011-agent-operators-django-sandbox-synthetic-data.md)): world, task, condition, agent run, harm. A **world** is one generated sandbox state (generator version + seed). A **task** is a user instruction with its expected ledger end state, admitted only after a scripted solver reaches that state. A **condition** is design level × fault type × fault rate (B1) or tool manifest × defense (B2). An **agent run** is one model attempting one task under one condition. It records:
- the model ID, provider and date; the system-prompt and tool-manifest hashes;
- sampling settings and framework retry settings;
- the fault schedule seed; the spend; the redacted transcript and tool calls;
- the final ledger diff;
- the exclusion reason, if any.

These go into evidence schema 1.2, which gets its own ADR when it's built.

Evidence record, schema v1 ([ADR 009](decisions/009-evidence-schema-v1.md), `packages/checks/src/evidence.ts`). One per check run:
```json
{
  "schema_version": "1.1",
  "record_id": "LAB-0-20261003T225947Z/duplicate-delivery@1",
  "run_id": "LAB-0-20261003T225947Z",
  "subject_id": "lab:owned-checkout",
  "authorization_id": "owned-lab",
  "control_id": "idempotency",
  "check_id": "duplicate-delivery",
  "check_version": 1,
  "registry_version": "1",
  "metric_version": "0.1",
  "observation_layer": "backend-and-provider",
  "oracle": "fulfillment-records",
  "description": "The same event delivered twice fulfills once",
  "status": "pass",
  "expected": 1,
  "observed": 1,
  "error": null,
  "review_state": "automated",
  "provider": "lab-provider",
  "provider_api_version": "1",
  "artifact_sha256": null,
  "redaction_policy": "allowlist-v1",
  "redactions": [],
  "provenance": {
    "source_commit": "<40-hex commit of the subject>",
    "source_dirty": false,
    "harness_commit": "<40-hex commit of the checks and harness>",
    "dependency_lock_sha256": "<sha256 of package-lock.json>",
    "runtime": "node-v24.0.0",
    "started_at": "2026-10-03T22:59:47.120Z",
    "ended_at": "2026-10-03T22:59:47.131Z"
  }
}
```
The example values are illustrative. `provenance` is null in the committed fixtures under `data/runs/`, which must regenerate identically; `npm run evidence` writes full records to `data/evidence/` (git-ignored). The redaction policy stores only these fields and scalar values, and scrubs card numbers, keys, tokens and emails from text.

Null evidence is unknown, never pass. Separate true seeded defect labels from assessor-visible evidence. Do not leak mutation/profile labels into the assessor or model inputs. Seeded defects are an oracle for controlled tests, not a guarantee all other defects are absent.

## Recommended components
| Role | Tool | Reason / limitation |
|---|---|---|
| Browser automation | Playwright, Chromium/CDP | Deterministic flow, frames and browser network events; no backend visibility |
| Provider compatibility | Stripe test environments, Square Sandbox | Official integration behavior; not production fraud/payment-rail equivalence |
| Ground truth | Instrumented merchant state machine + database assertions | Verify economic/business effects directly |
| Server correlation | OpenTelemetry | Correlate order/payment/events using redacted identifiers |
| Deterministic faults | Local provider emulator, fixtures and bounded schedule replay | No external targets; emulator must be checked against sandbox semantics |
| General baseline | OWASP WSTG, passive ZAP in owned lab | Helps generic coverage; does not prove business logic correctness |
| Experiment metadata | SQLite initially; Parquet/DuckDB for later analysis | Reproducible runs and columnar analysis without early infrastructure burden |
| Analysis | Python/pandas, scipy/statsmodels, seeded bootstrap | Cluster-aware statistics and reproducible notebooks |
| CI and provenance | GitHub Actions, pinned releases and container digests | Run unit/model tests; do not put external scanners into default CI |
| Review | Human adjudication plus source/config review | Resolve inconclusive or conflicting evidence; blind to seeded defect labels |

Implemented so far: the PIAS engine (`packages/core`), the SubjectAdapter interface and versioned check registry and evidence schema v1 (`packages/checks`), the local reference checkout on `node:sqlite` with a transactional fulfillment outbox, a fake provider and seeded defects (`lab/`), the static site and CI. Other tools are recommendations for later phases. Verify maintained releases and pin versions when adopting them; no arbitrary package versions have been asserted here.

## Execution architecture to build
Scope gate → scheduler → subject in its own container (architecture variant, open-source shop or reference) → SubjectAdapter → sandbox or emulator.
Browser, merchant database and provider events → evidence records under the redaction policy → invariant oracle → versioned scorer → researcher portal (stores and shows runs) → research dataset.
Runs start locally or in CI, never from the hosted portal.

Track B, per agent run: generator (seed → world, task, fault schedule, tool manifest) → fresh Docker compose stack (Django sandbox + Postgres with no egress, MCP tool server, agent runner allowed only the model API hosts) → agent attempts the task → the test-control API reads the ledger → agent harm oracle → evidence record (schema 1.2) → portal → research dataset. The stack is discarded after each run.

| Role | Tool | Reason / limitation |
|---|---|---|
| Payments sandbox | Django + Postgres, Django admin | ORM transactions and row locks for the ledger; migrations; admin as an inspection console |
| Ledger tests | pytest, Hypothesis | Property tests for invariants (sum to zero, one effect per intended payment); concurrency tests |
| Agent tools | MCP server (Python SDK) | The protocol agents actually use; tool manifests can be swapped per condition |
| Agent runner | LangChain/LangGraph | One code path across model providers. Framework retries must be set explicitly |
| Synthetic data | Python generator (Faker plus seeded distributions) | Ground truth by construction; realism is limited to the stated distributions |
| Isolation | Docker, compose, pinned image digests | Fresh stack per run; network egress enforced per container |

Use a durable queue and atomic database transaction/outbox for reference fulfillment. Deduplicate by the business action as well as provider event identity: separate events can refer to one payment/order. Handle crash recovery, retries and delayed state without trusting the return page. The reference checkout is lab code for calibration, not production payment code.

## Validation sequence
1. Scorer edge cases; reference checkout with seeded defects, each caught only by its own control (implemented).
2. Check registry and evidence records (implemented); harm oracle (implemented, `data/harm/`); detection rate on automatically mutated variants.
3. Stripe and Square emulators conformance-tested against recorded sandbox events; reference passes against both real sandboxes.
4. Container isolation, architecture variants and open-source shops; pilot on a small variant matrix with blind adjudication and redaction/egress tests.
5. Architecture sweep and literature review; publish the subject manifest, completion counts and exclusions.
6. External merchant staging only in future work, after scope and ethics gates.

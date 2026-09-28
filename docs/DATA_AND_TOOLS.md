# Dataset and tooling design

## Dataset units
Distinguish subject, run, check, harm scenario and finding. A **subject** is one runnable integration: an agent-generated app, an open-source shop or a calibration variant of the reference checkout (see [RESEARCH_PLAN.md](RESEARCH_PLAN.md#subjects)). The site's 12 synthetic F-fixtures are illustrative labels, not subjects.

Each subject carries its source (agent, open-source or calibration), provider, architecture, prompt condition, generation provenance and split. Each run adds commit SHA, dependency lock hash, provider API/SDK versions, instrument version, metric version, scope authorization ID/expiry, collection start/end, infrastructure version, navigation outcome and exclusion reason. Keep unit identifiers stable across reruns.

Proposed evidence record:
```json
{
  "schema_version": "1.0-draft",
  "run_id": "synthetic-run-001",
  "subject_id": "agent-x/stripe/hosted/P0/s1",
  "test_id": "duplicate-completion",
  "control_id": "idempotency",
  "status": "unknown",
  "observation_layer": "backend-and-provider",
  "expected": "one fulfillment per paid order",
  "observed": null,
  "artifact_sha256": null,
  "source_commit": null,
  "provider_api_version": null,
  "metric_version": "0.1",
  "authorization_id": "owned-lab",
  "redaction_version": "allowlist-v1",
  "review_state": "not-run"
}
```
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

Implemented so far: the PIAS engine (`packages/core`), the SubjectAdapter interface and versioned check registry (`packages/checks`), the local reference checkout on `node:sqlite` with a transactional fulfillment outbox, a fake provider and seeded defects (`lab/`), the static site and CI. Other tools are recommendations for later phases. Verify maintained releases and pin versions when adopting them; no arbitrary package versions have been asserted here.

## Execution architecture to build
Scope gate → scheduler → subject (starter-shop app, open-source shop or reference) → SubjectAdapter → sandbox or emulator.
Browser, merchant database and provider events → allowlisted evidence collector → invariant oracle → versioned scorer → research dataset and site.

Use a durable queue and atomic database transaction/outbox for reference fulfillment. Deduplicate by the business action as well as provider event identity: separate events can refer to one payment/order. Handle crash recovery, retries and delayed state without trusting the return page. The reference checkout is lab code for calibration, not production payment code.

## Validation sequence
1. Scorer edge cases; reference checkout with seeded defects, each caught only by its own control (implemented).
2. Check registry, evidence records and harm oracle; detection rate on automatically mutated variants.
3. Stripe and Square emulators conformance-tested against recorded sandbox events; reference passes against both real sandboxes.
4. Starter shop, frozen prompts and generator; pilot of 15–20 subjects with blind adjudication and redaction/egress tests.
5. Main study; publish the subject manifest, completion counts, exclusions and cost.
6. External merchant staging only in future work, after scope and ethics gates.

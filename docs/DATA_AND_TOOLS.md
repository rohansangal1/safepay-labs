# Dataset and tooling design

## Dataset units
Distinguish template family, implementation variant, configuration, run, test case and finding. The current generator makes 3,072 configuration records only. It does not deploy sites or run provider integrations. The 12 dashboard examples are separate illustrative control labels, not observations from that manifest or outputs from the offline toy model.

Each configuration carries family, architecture, provider, profile, schedule seed, split and execution status. Each future run adds commit SHA, dependency lock hash, provider API/SDK versions, instrument version, metric version, scope authorization ID/expiry, collection start/end, infrastructure version, navigation outcome and exclusion reason. Keep unit identifiers stable across reruns.

Proposed evidence record:
```json
{
  "schema_version": "1.0-draft",
  "run_id": "synthetic-run-001",
  "fixture_id": "F1-hosted-stripe-M0-S0",
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

Only the static dashboard, Node score/model/generator and dependency-free tests are installed/implemented. Other tools are recommendations for the next milestone. Verify maintained releases and pin versions when adopting them; no arbitrary package versions have been asserted here.

## Execution architecture to build
Scope gate → scheduler → isolated browser worker → owned checkout fixture → sandbox adapter.
Browser, merchant database and provider events → allowlisted evidence collector → invariant oracle → versioned scorer → research dataset/dashboard.

Use a durable queue and atomic database transaction/outbox for real fixture fulfillment. Deduplicate by the business action as well as provider event identity: separate events can refer to one payment/order. Handle crash recovery, retries and delayed state without trusting the return page. The offline toy model is intentionally much smaller and lacks cryptography, persistence, real concurrency and provider adapters; it is not production payment code.

## Validation sequence
1. Verify scorer edge cases and synthetic model detection (implemented).
2. One reference checkout, one provider sandbox, clean/defect pair and verified evidence chain.
3. Add the second provider and architecture variants; freeze capability mapping.
4. Pilot blind assessment and collector redaction/egress tests.
5. Scale the approved matrix; publish manifest, actual completion counts, exclusions and cost.
6. Add opt-in external staging only after scope and institutional gates.

# Payment Integration Assurance Score — PIAS 0.1

## Definition
PIAS measures evidence for specified integration controls under a declared scope. It is not a probability of compromise, a regulatory compliance score, or an absolute measure of security. Report an **assurance range + coverage + critical gate + scope**, not a bare number.

For each control i, record a positive weight w_i and one outcome: pass, fail, unknown, or reviewed not-applicable. A pass needs affirmative evidence from the required observation layer; a failed test requires a reproducible invariant violation or directly verified missing control. Unreachable tests are unknown. A claim from source code alone can support review but does not prove runtime behavior.

Let A be the sum of applicable weights, P passed weight, F failed weight and U unknown weight. A=P+F+U.
- Lower assurance bound L=100P/A.
- Upper assurance bound H=100(P+U)/A.
- Coverage C=100(P+F)/A.
- Observed pass rate O=100P/(P+F), undefined when nothing is assessed.

[L,H] is an **epistemic bound caused by unobserved controls**, not a confidence interval. L is conservative credited assurance, not proof that all unknown controls fail. With all unknown, report [0,100], 0% coverage and insufficient evidence. If all controls are legitimately N/A, scores are undefined and the scope is not applicable. N/A requires a reason and independent review; it must not be used to remove a failed control or a control that cannot be observed.

## Draft catalog
| Control | Weight | Critical | Required evidence examples |
|---|---:|---|---|
| Server-authoritative amount | 15 | Yes | Server catalog/order and provider amount/currency match |
| Order and merchant binding | 10 | Yes | Cross-object identity checks plus business-state oracle |
| Webhook authenticity | 10 | Yes | Provider-specific verification plus negative sandbox cases |
| Verified fulfillment | 10 | Yes | Provider success correlated with committed fulfillment |
| Object authorization | 10 | Yes | Two owned synthetic identities and order-level isolation |
| Idempotency/replay | 10 | No | Repeated/concurrent delivery causes one economic effect |
| Lifecycle | 10 | No | Delayed/reordered/canceled/refunded state transitions |
| Secret isolation | 5 | No | Source/config review and redacted runtime evidence |
| Data minimization | 5 | No | Artifact inspection and retention policy |
| Browser integrity | 5 | No | Scripts, deployment policy and applicable provider guidance |
| Recovery/reconciliation | 5 | No | Dropped event and worker-failure recovery traces |
| Audit/maintenance | 5 | No | Version provenance, dependency review and audit events |

Weights sum to 100. They express provisional expert priorities, not empirically estimated risk. Split composite controls into explicit subchecks for the actual benchmark; a parent passes only when all required subchecks pass, fails on a verified failing subcheck, and is unknown otherwise. Preserve subcheck evidence.

## Noncompensating gate
If any critical control fails: **critical failure**, regardless of numerical score.
If any applicable critical control is unknown, or C<80%: **insufficient evidence**.
Otherwise: **assessed**. This label does not mean safe, certified, or vulnerability-free. A noncritical failure remains a failure and must be displayed. The 80% threshold is a draft research convention to validate, not an industry standard.

Example: pass 75, fail 10, unknown 15 yields [75,90], coverage 85%, observed pass rate 88.2%. If the failed control is webhook authenticity, the result is critical failure. A browser-only observation can yield a wide range and must not be ranked alongside instrumented tests.

## Evidence and versioning
Each evidence item should include fixture ID, pseudonymous run ID, observation layer, test ID, oracle version, expected/observed invariant, timestamp, source commit, provider API version, artifact hash and redaction policy version. Self-attestation is separate from verified outcomes. Record assessor and adjudication state; do not collapse confidence into an unexplained numeric multiplier.

Version controls and weights together. Report before/after changes only under the same metric or rescore retained compatible evidence. Publish individual vulnerability severity separately, optionally with CVSS v4.0; CVSS does not measure absence of defects across an integration.

The implemented engine validates status, evidence presence, reviewed N/A and weights. It does not authenticate evidence content or enforce institutional review. Dashboard evidence strings are synthetic placeholders. Durable evidence validation and real test oracles remain future work.

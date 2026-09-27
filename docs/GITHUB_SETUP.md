# GitHub setup and initial backlog
Intended remote: https://github.com/rohansangal1/payment-integration-lab
Keep private while metric and evidence handling mature. License selection and publication approval are owner decisions.

Included: README, security policy, PR template, dependency-free CI, score tests, offline fixture model, manifest generator, dashboard and research documents. No keys or raw traces are required.

Suggested settings after first push: require PR review and passing Research checks on main; disallow force pushes; enable private vulnerability reporting when supported; enable secret scanning/push protection if available for the account/plan. These settings are recommendations, not already configured. Current workflow action tags should be pinned to reviewed immutable commit SHAs before using privileged CI or secrets.

Initial milestones/issues to create after scope review:
1. Protocol v1: full-text literature extraction and novelty matrix; record exclusions.
2. Metric v1: explicit subchecks, independent oracle definitions and preregistration.
3. Owned checkout: one reference with payment/order state database and no outbound fulfillment.
4. Stripe sandbox adapter: authoritative completion and negative cases.
5. Square sandbox adapter: provider-specific signature and lifecycle mapping.
6. Browser harness: deterministic flows, bounded retries and navigation-inconclusive state.
7. Evidence pipeline: redaction, hashes, scope IDs and retention enforcement.
8. Safety runner: allowlisted egress, expiry, kill switch and live-mode rejection.
9. Blind pilot: independently annotated defect/control profiles and held-out family split.
10. Architecture study: matched experiments and Pareto analysis.
11. External cohort: consent template, institutional determination and recruitment.
12. Artifact release: reproducibility scripts, data card and coordinated disclosure review.

No external assessment jobs should run automatically on pull requests. Fork PRs must never obtain processor secrets. Use dedicated sandbox accounts and manual protected workflows for future approved integrations.

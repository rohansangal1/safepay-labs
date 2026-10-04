# 010. Evidence schema 1.1: oracles for retained artifacts and the audit trail

- **Status:** Accepted, 2026-10-03

## Context
The checks for secret isolation, data minimization and audit do not count fulfillments. They read what a subject leaves behind: its HTTP responses, log lines, stored rows and audit trail. Schema 1.0 ([ADR 009](009-evidence-schema-v1.md)) allows two oracles, `fulfillment-records` and `http-response`, and neither describes a decision made from logs or an audit trail. ADR 009 requires a version bump and a record here for any change to a field's meaning.

## Decision
- **Two new `oracle` values:** `retained-artifacts` (log lines and stored rows) and `audit-trail`. Checks on HTTP responses keep `http-response`.
- **Schema version `1.1`.** No field is added, removed or renamed. Every 1.0 record is a valid 1.1 record apart from its version string.
- **`SubjectAdapter` gains an optional `artifacts`:** the secrets the harness gave the subject, the responses it sent, its log lines, its stored rows and its audit trail in provider-neutral actions. A subject that does not offer it leaves these checks unknown, never passed.
- **Raw artifacts never enter a record.** A check searches them and reports a count. Redaction policy `allowlist-v1` is unchanged, and `artifact_sha256` stays null.
- **Sensitive values are planted, not guessed.** The checks send a synthetic email and a sandbox test card number in the event's billing details and search for those exact values, and for the secrets the harness itself supplied.

## Consequences
- Check registry version 3: 30 checks across 11 controls. The metric version (0.1) is unchanged; coverage on the reference checkout rises from 80 to 95.
- The Python loaders accept 1.0 and 1.1.
- The checks cover part of each control's stated evidence. Secret isolation is checked at runtime only, with no source or configuration review. Audit is checked for audit events only, with no dependency review or alerting. Data minimization looks for the planted values only. A pass on these three controls means the checks found no leak or gap, not that the whole control is met; whether the catalog should say so is a metric v1 question.
- An exact-match search misses a value the subject has encoded or truncated. Pattern-based detection is left for later.
- A subject that returns a success status for a rejected webhook leaves `rejected-event-audited` unknown, because the check cannot tell a rejection from an acceptance.

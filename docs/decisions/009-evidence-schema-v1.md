# 009. Evidence schema v1

- **Status:** Proposed, 2026-10-03

## Context
A control's evidence was a summary string such as `lab:owned-checkout:amount:3/3-checks-passed`, and the engine only checked that it was not empty. Nothing recorded which code was tested, with which versions, or when, and nothing stopped a sensitive value from being written into `data/runs/`. [METRIC.md](../METRIC.md#evidence-and-versioning) lists what an evidence item should carry.

## Decision
- **One record per check run**, defined in `packages/checks/src/evidence.ts` with a zero-dependency validator. A control result holds its records in `records`; the summary string in `evidence` stays, so the scoring engine and the metric version (0.1) are unchanged.
- **Versions on every record:** schema (`1.0`), metric, check registry, the individual check, provider API and redaction policy.
- **Provenance is one nullable block:** subject commit, whether the working tree was dirty, harness commit, dependency lock hash, runtime, and start and end time of the check. The caller supplies it; it is never guessed.
- **Committed fixtures carry no provenance.** `data/runs/*.json` must regenerate byte-for-byte, and commits and timestamps change on every run. `npm run assess` writes records with `provenance: null`. `npm run evidence` writes full records to `data/evidence/*.jsonl`, which is git-ignored.
- **Unknown is never pass, enforced by the validator.** A pass needs a non-null observation equal to the expectation and no error. A check that errors is `unknown`, stores no values and is marked `needs-review`.
- **Redaction policy `allowlist-v1`:** only the schema's fields may appear; expected and observed values must be scalars (anything else is dropped); text has card numbers, provider keys, bearer tokens, long hex secrets and email addresses replaced and is capped at 256 characters. The runner redacts before building a record and refuses to continue if a record still fails the policy.

## Consequences
- The runner now needs a run ID and an authorization ID. `SubjectAdapter` gains an optional `provider`.
- `checks` on a control result is replaced by `records`; the portal and the Python loaders read the new shape, and the loaders refuse an evidence schema version they do not know.
- The validator checks shape and consistency. It does not prove a record is true or untampered; signing is out of scope for v1.
- `artifact_sha256` is in the schema but always null today, because no harness stores raw artifacts yet. Hashing a raw value directly would be unsafe for low-entropy data such as card numbers.
- `review_state: adjudicated` is reserved for human review and has no workflow yet.
- Redaction is pattern-based and can miss a secret in an unfamiliar format. The scalar-only rule and the field allowlist are the main defence; the patterns are a backstop.
- Any change to fields or their meaning bumps the schema version and gets a new record here.

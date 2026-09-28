# 002. Validate PIAS against a separate harm oracle

- **Status:** Accepted, 2026-09-27

## Context
PIAS is computed from control checks. If "violations" are measured with the same checks, showing that the score predicts violations is circular.

## Decision
Add a **harm oracle** that measures outcomes, not controls. It runs end-to-end scenarios and reads the provider sandbox ledger and the merchant's database to count:
- goods fulfilled for less than was captured (underpayment);
- orders fulfilled more than once;
- one customer reading or acting on another's order;
- paid orders never fulfilled after the recovery window;
- refunds or cancellations leaving order and payment state inconsistent.

The harm oracle never feeds the score. The validation question is whether PIAS, computed on a subject, predicts that subject's harm outcomes on held-out subjects.

## Consequences
- Checks and harm scenarios live in separate modules with separate owners where possible, and harm scenarios are frozen before the main study.
- Some overlap in mechanics (both send events) is expected. The separation is in what is measured and when it's fixed.

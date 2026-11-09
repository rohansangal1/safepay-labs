# 011. Add a second track: LLM agents operating payment tools, in a Django sandbox with synthetic data

- **Status:** Proposed, 2026-11-08
- **Amends:** [007](007-rescope-architectures-and-testing-tool.md) (adds Track B and changes the order of work) and [003](003-dependencies-and-layout.md) (Python with pinned dependencies under `lab/`, Docker images).

## Context
ADR 007 asks which payment-integration designs prevent money-level harm when an attacker sends forged, replayed, reordered or mismatched provider events. There's a second way money now moves wrongly: an LLM agent that *operates* payment tools (pay this invoice, refund that order, pay out these sellers) can double-pay after a timeout, pay the wrong party, or report success that never happened. That's the same question with a different party misbehaving, and the parts already built (harm oracle, fake provider ledger, evidence records, safety boundary, portal) carry over.

Closest work, as of November 2026 (details in [LITERATURE.md](../LITERATURE.md)):
- **Faghih et al., EMNLP 2025** (UMD Reliable AI Lab): edits to tool descriptions substantially shift which tool an agent picks. Not about payments; code is public.
- **Mansoor, Rana and Phadke, arXiv 2608.02645 (Aug 2026):** non-atomic tool failures (timeout after dispatch, delayed visibility, partial success, stale conflict) cause duplicate side effects, and an agent-side verify-before-retry wrapper reduces them. One model, two non-payment tasks, a simulator; testing on richer APIs is left as future work.
- **τ-bench (ICLR 2025):** scores agents by comparing the final database state with a goal state and introduces pass^k for consistency. Retail and airline, not payments; no fault injection.
- **AgentDojo (NeurIPS 2024):** prompt injection through tool outputs, including a banking suite. Doesn't vary the API design or model faults.
- **APort Vault (arXiv, Sep 2026):** payment-authorization attacks on a payment agent; a deterministic policy layer blocked unpermitted transfers. Vendor preprint, one tool schema.

None of these treats the **design of the payment API itself** (idempotency, status lookup, error semantics, tool provenance) as the variable, or measures harm on a **double-entry ledger** across several models.

## Decision
1. **Two tracks, one question.** *Which payment-system designs prevent money-level harm when the party on the other side misbehaves?*
   - **Track A** (ADR 007, unchanged in substance): integrations attacked with forged, replayed, reordered and mismatched provider events.
   - **Track B** (new): LLM agents operating payment tools. **B1** studies agents under tool faults, with the API design as the treatment. **B2** extends Faghih et al. to money-moving tools: manipulated tool descriptions, and defenses.
2. **Agents as operators, not as code authors.** ADR 007's decision on *coding* agents (evidence from a literature review) stands. Track B studies agents that call payment tools at run time.
3. **Order of work.** Track B goes first, B1 then B2, because it reuses what's built and has a shorter path to a result. Track A resumes after the B1 results, at a reduced scope: the browser harness is parked, and one or two open-source shops instead of two or three. Nothing already built is removed.
4. **A Django payments sandbox** (`lab/sandbox/`, Django + Postgres) is the environment agents act on:
   - a double-entry ledger: immutable journal entries; cached balances updated in the same transaction with row locks; a drift check that compares cached balances with the entries;
   - payment intents with an explicit state machine, plus refunds and payouts;
   - idempotency keys;
   - a fault layer, configured per run, that can produce timeout after commit, delayed visibility, partial success, stale conflict and duplicate delivery;
   - a test-control API for the harness, and the Django admin as the inspection console.

   Agents reach it only through an MCP tool server (`lab/agents/`). A Django checkout can later join Track A's variant set through an HTTP `SubjectAdapter`. The TypeScript checks, harness and reference checkout are not rewritten (ADR 007 point 3 holds).
5. **Docker for every run.** Each run starts fresh containers from a compose file: sandbox and database, tool server, agent runner. They're discarded afterwards. The sandbox has no network egress; the agent runner may reach only the configured model API hosts. This brings ADR 007's container isolation forward, and Track A reuses it.
6. **Synthetic data only.** A seeded generator (`lab/synth/`) builds each *world*: merchants, customers, accounts, balances, payees, invoices and history, drawn from stated distributions. It also builds the *tasks*, each with the ledger end state it should produce, the fault schedules for B1, and the manipulated tool manifests for B2. No real people, accounts or card data, ever. The generator is versioned, and worlds and tasks are frozen before the main run.
7. **Agent harm oracle**, following ADR 002. After each run it reads the ledger and compares it with the task's expected end state. Harms:
   - **duplicate payment:** more than one economic effect for one intended payment;
   - **wrong amount;**
   - **wrong payee:** money sent to a party the task didn't name;
   - **unauthorized action:** a money movement the task didn't ask for;
   - **lost payment:** a required payment never made;
   - **false report:** the agent's final claim contradicts the ledger.

   It never feeds a score, and its scenarios are frozen before the main run.
8. **Agent runner.** It uses LangChain/LangGraph for model-neutral tool calling. At least three models from at least two providers, including one open-weight model. Settings are fixed, and each task is repeated *k* times so pass^k can be reported. Framework-level retries are set explicitly and recorded, never left at defaults. Agent runs get their own evidence records (schema 1.2, its own ADR when built): model ID and date, prompts, tool-manifest hash, design level, fault schedule, seed and a redacted transcript.
9. **Treatments.**
   - **B1 API design levels:** (a) no idempotency; (b) optional idempotency key; (c) required idempotency key; (d) server-side dedupe, a status-lookup tool and an explicit "outcome unknown" error. These are crossed with fault type and rate.
   - **B2:** description edits (following Faghih et al.) on competing money-moving tools. Defenses: a pinned tool registry, a deterministic payee and amount policy, and a confirm-before-send step.
10. **Machine learning** stays undefined (ADR 007 point 6). The LLMs are study subjects, not models we train.

## Consequences
- RESEARCH_PLAN moves to draft 0.4 with RQ6–RQ7, the Track B design and a revised milestone table. PLAN, the roadmap, SAFETY, LITERATURE, DATA_AND_TOOLS, README and CLAUDE.md are updated with this record.
- `lab/` may hold Python projects (one uv workspace, pinned by `uv.lock`) and Dockerfiles pinned by image digest. `packages/` keeps zero runtime dependencies.
- Model API keys become the only secrets the lab needs. They live in a git-ignored `.env`, never in containers other than the agent runner, and never in evidence. Every run has a spend cap.
- Manipulated tool descriptions are research artifacts only. They are never published to a public MCP registry or offered to anyone else's agent ([SAFETY.md](../SAFETY.md)).
- Novelty risk: Mansoor et al. could extend to payments, and AgentDojo's banking suite could add faults. Our position rests on provider-side design as the treatment, the ledger-based harm oracle and the multi-model comparison. Re-check before preregistration.
- Track A's timeline moves later by roughly the length of Track B (about 12 weeks at ~15 h/week).
- B2 builds directly on a UMD paper. The B1 pilot results are the natural thing to share with its authors.

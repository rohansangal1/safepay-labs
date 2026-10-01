# 003. Zero-dependency core, pinned dependencies in the lab

- **Status:** Accepted, 2026-09-27. Amended by [008](008-public-landing-and-researcher-portal.md): adds `portal/` (Python, pinned dependencies) and `public/`.

## Context
The project should become a tool people trust enough to point at their own checkout. The research lab, however, needs browsers, containers and provider SDKs.

## Decision
- `packages/` (engine, checks, CLI) has **zero runtime dependencies**. Dev-only tooling (`typescript`, `@types/node`) is allowed.
- `lab/` (emulators, subjects, generator, browser harness) may use dependencies, pinned to exact versions with a committed lockfile.
- Layout: `packages/{core,checks,cli}`, `lab/{emulator,subjects,generator,harness}`, `analysis/` (Python), `data/`, `site/`, `docs/`. Uses npm workspaces.
- The site consumes the engine through `scripts/build-site.ts`, never by importing from `site/`.

## Consequences
The core stays small and auditable. Things like persistence use Node built-ins (`node:sqlite`) rather than packages.

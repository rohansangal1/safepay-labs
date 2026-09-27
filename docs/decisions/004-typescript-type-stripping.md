# 004. TypeScript run by Node type stripping

- **Status:** Accepted, 2026-09-27

## Decision
Write TypeScript and run it directly with Node's type stripping. There's no build step or bundler. `.npmrc` sets `node-options` so every npm script enables it. `tsc` (dev dependency, exact version) only type-checks in CI.

- Supported Node: 22.13 or newer (`engines`). Development and CI also use 24 (`.nvmrc`).
- Code must be erasable syntax: no `enum`, `namespace` or constructor parameter properties (`erasableSyntaxOnly`). Relative imports include the `.ts` extension.

## Consequences
Contributors need no build tooling. The browser engine is produced with `module.stripTypeScriptTypes`, so the site and tests run the same code.

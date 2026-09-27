# Payment Integration Lab

Research starter for an evidence-aware Payment Integration Assurance Score (PIAS), version 0.1. Draft methodology; not a PCI assessment, validated probability of compromise, or merchant ranking.

## What is implemented
- Interactive dashboard with synthetic examples, evidence inspection, score sandbox, architecture comparison, literature and protocol.
- Shared deterministic score engine and regression tests.
- Generator for 3,072 **configuration records**, not deployed websites or collected observations.
- Offline payment-state toy model with a deliberately seeded duplicate-fulfillment defect.
- Research protocol, metric specification, compliance plan, dataset design and GitHub CI.

## Run
Requires Node.js 22+ and Python 3 for the optional static preview. No npm dependencies or processor keys.

```sh
npm test
npm run dataset
npm run demo
npm run preview
```
Open http://127.0.0.1:4173. Dashboard observations are explicitly illustrative and are not outputs of the toy model. Data is bundled; sandbox changes last only for the current page session. Export downloads JSON locally. No data upload, external scanner, live payment capability or multi-user storage is implemented.

## Read
- [Research protocol](docs/RESEARCH_PLAN.md)
- [Score specification](docs/METRIC.md)
- [Related work and primary sources](docs/LITERATURE.md)
- [Safety and compliance](docs/SAFETY.md)
- [Dataset and tooling](docs/DATA_AND_TOOLS.md)
- [GitHub setup and backlog](docs/GITHUB_SETUP.md)

## Next implementation milestone
Build one owned checkout fixture, then a sandbox adapter and deterministic Playwright workflow; connect provider events and the fulfillment database to the evidence oracle. Do not scale collection until seeded-defect detection and false-positive rates are measured.

License selection is pending owner approval; no open-source license has been asserted. Start with a private repository. Intended owner: rohansangal1.

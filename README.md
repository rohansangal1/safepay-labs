# Payment Integration Lab

Research starter for an evidence-aware Payment Integration Assurance Score (PIAS), version 0.1. Draft methodology; not a PCI assessment, validated probability of compromise, or merchant ranking.

[GitHub repository](https://github.com/rohansangal1/payment-integration-lab)

## What is implemented
- Research workspace website (`site/`): overview dashboard, benchmark explorer, score sandbox, roadmap, research library and document index.
- Shared deterministic score engine and regression tests.
- Generator for 3,072 **configuration records**, not deployed websites or collected observations.
- Offline payment-state toy model with a deliberately seeded duplicate-fulfillment defect.
- Research protocol, metric specification, compliance plan, dataset design and GitHub CI.

## View the website locally
The site is plain HTML, CSS and JavaScript with no build step. It loads JSON files, so serve it over HTTP. Opening `index.html` directly from disk won't work.

1. Open a terminal in the repository root.
2. Start a local server. Either of these works:
   ```sh
   npm run preview
   # or, without Node:
   python3 -m http.server 4173 --bind 127.0.0.1 --directory site
   ```
3. Open http://127.0.0.1:4173 in your browser.
4. Press `Ctrl+C` in the terminal to stop the server.

Edit files in `site/` and refresh the browser to see changes. Most content is data you can edit without touching code:

| File | Controls |
|---|---|
| `site/data/milestones.json` | Roadmap board and progress. Set `status` to `not-started`, `in-progress` or `done` |
| `site/data/library.json` | Research library entries |
| `site/data/controls.json` | PIAS control catalog and weights (also used by the tests) |

All fixture results on the site are synthetic and are not outputs of the toy model. Sandbox changes last only until the page reloads.

## Run the research scripts
Requires Node.js 22+. No npm dependencies or processor keys.

```sh
npm test         # score engine and toy-model tests
npm run dataset  # regenerate data/manifest.json
npm run demo     # run the offline toy model
```

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

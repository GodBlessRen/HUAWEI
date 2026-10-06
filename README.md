# HUAWEI ACM Web Practice

A browser-first Huawei ACM practice workspace deployed with GitHub Pages.

## What this version changes

- No local Python installation required.
- No public code-execution backend.
- Python runs in a browser Web Worker through Pyodide.
- Problem statements, samples, and official solution text are loaded on demand from the upstream public dataset.
- Draft code and AC progress stay in the browser's localStorage.
- Sample judge supports ACM-style stdin/stdout workflows.

## Open the site

After GitHub Pages is enabled for this repository, the site URL is:

https://godblessren.github.io/HUAWEI/

## Architecture

```text
GitHub Pages
  |
  +-- index.html / styles.css / app.js
  |
  +-- py-worker.js
  |     +-- Pyodide (Python in WebAssembly)
  |
  +-- upstream public dataset
        +-- manifest.json
        +-- problem.md
        +-- samples/*.in / *.out
        +-- official_solution.md
```

The website only performs sample judging. It is not an official Huawei / CodeFun judge and does not reproduce server-side hidden test cases.

## Data source and rights

The practice dataset is based on the public project:

https://github.com/Zhou-xingyu-ts/huawei-acm-practice

Problem statements, sample data, and official-solution-derived materials may remain subject to their original rights and platform terms. See [DATA_NOTICE.md](./DATA_NOTICE.md).

## Security model

User code runs inside a dedicated browser Web Worker, not on a public server. A timeout terminates the worker and recreates the Python runtime. No API keys are required or stored.

## GitHub Pages

This repository includes `.github/workflows/pages.yml` for GitHub Actions deployment. If Pages has not been enabled yet, open:

`Settings -> Pages -> Build and deployment -> Source -> GitHub Actions`

Then rerun the workflow or push a new commit.

## License

Repository-authored code: MIT. See [LICENSE](./LICENSE).

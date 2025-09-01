# Repository Guidelines

## Project Structure & Modules
- Root: static site files (`index.html`, `index-accessible.html`, `sisu.gif`).
- `library/`: 3D library viewer (`index.html`), data (`graph.json`), covers in `library/img/` named by ISBN (e.g., `library/img/052139838X.jpg`).
- `utils/`: data tools (e.g., `librarything-to-graph.js`) and raw export (`librarything_caseygollan.json`).
- `ai/`: AI tracing UI (`ai/index.html`) lists `.claude-trace/*.html` logs.
- `.github/workflows/deploy-pages.yml`: GitHub Pages deployment (copies site to `_site/` and injects AI trace list).
- `.claude-trace/`: LFS-tracked trace logs; only HTML files are published.

## Build, Test, and Development
- Install: `npm install`
- Serve locally: `npm run dev` (or `npm run serve`) → http://localhost:8080
- Update library data: `npm run update-library`
  - Input: place exported `librarything_caseygollan.json` in `utils/`.
  - Output: downloads covers to `library/img/`, writes `library/graph.json` and sets `averageColor` metadata.
- Manual checks: load `/`, `/library/`, and `/ai/` locally; open DevTools console for errors.

## Coding Style & Naming
- HTML/CSS/JS only; prefer 2-space indentation and semicolons in JS.
- Keep vanilla JS modules (e.g., unpkg imports) and inline CSS consistent with existing files.
- File naming: lowercase-kebab-case for new files; images named by ISBN with `.jpg` in `library/img/`.
- Do not commit `node_modules/` or private exports; compress new cover images (e.g., ImageOptim) after generation.

## Testing Guidelines
- No automated tests. Validate manually:
  - Library: books render, grid/graph toggle works, sort modes cycle, click/zoom behavior ok, no 404s for cover images.
  - Data: `library/graph.json` updates and `averageColor` present for books with real covers.
  - AI page: entries appear with relative timestamps and counts.

## Commit & Pull Request Guidelines
- Commits: short, imperative summaries (e.g., "Add grid sorting toggle", "Fix AI tracing timezone display"). Group related changes.
- PRs: describe intent, list affected pages/paths, include screenshots or a short GIF for UI changes (`/`, `/library/`, `/ai/`). Link issues when applicable.
- Note any data updates (e.g., ran `npm run update-library`) and asset changes. LFS is configured for `.claude-trace/` HTML; leave that flow unchanged.

## Security & Deployment
- No secrets in repo; site deploys via GitHub Pages on pushes to `main`.
- Custom domain via `CNAME`. If using LFS locally, ensure `git lfs install` is set up.

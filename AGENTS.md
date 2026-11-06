# Agent guidance

Casey Gollan's personal website uses SvelteKit 2, Svelte 5, TypeScript, Vite, and Bun. Production is a Cloudflare Worker with static assets, not Pages. Use the existing Wrangler configuration and pinned dependencies.

## Commands

- `bun install`: install dependencies.
- `bun run dev`: fast Vite development; no Cloudflare bindings.
- `bun test`: regression tests.
- `bun run check`: Svelte/TypeScript diagnostics. Existing errors remain; record the baseline and report new failures separately.
- `bun run build`: initialize the content submodule, then build with Vite.
- `bun run preview`: build and start Wrangler with local KV/R2 bindings.
- `bun run preview:remote`: build and connect to remote bindings; use only when remote resource access is intended.
- `bun run deploy`: build and change production. For packaging checks, use `bun run wrangler deploy --dry-run` instead.
- `bun run update-library`: process the LibraryThing export into library data and covers.

Use Bun for package management and local scripts. Run tests and a production build for code changes. Check the homepage and library after visualization changes, and posts/tag/date routes after content changes.

## Architecture

- `src/routes/+page.svelte`: interactive bio and homepage.
- `src/lib/components/SkillsGraph.svelte`: D3 skills visualization.
- `src/routes/library/[[isbn]]/`: Three.js book graph and detail view.
- `src/lib/posts.ts`: Vite-bundled Markdown snapshot; shared parsing is limited to production builds.
- `src/lib/server/`: shared Markdown parser and server-side content helpers.
- `content/`: canonical Git submodule. Preserve it; do not add another copy under `src/`.
- `static/library/`: generated library dataset and cover images.
- `utils/librarything-to-graph.js`: library import utility; input is `utils/librarything_caseygollan.json`.
- `wrangler.jsonc`: Worker entry point, assets, domain route, KV, and R2 bindings.
- `.svelte-kit/cloudflare/`: generated Worker and assets; never edit or commit generated output.

Cloudflare builds use `bun run build` followed by Wrangler deployment or version upload. Build caching and watch exclusions are configured on Cloudflare build triggers; see README.md.

## Editing and verification

- Inspect the working tree and preserve unrelated in-progress edits.
- Keep credentials out of source, logs, and commits. Local environment files are ignored.
- Preserve local dates, metadata, media, permalink behavior, and GitHub fallback behavior when changing post parsing.
- Do not cache mutable development content or fallback network responses across requests.
- Do not restore deleted archives, starter apps, generated output, Conductor workspaces, or browser screenshots to the repository.
- When editing Svelte, use `svelte-autofixer` if available; otherwise validate with the installed Svelte compiler and project checks.
- Verify deployed behavior directly before claiming a production fix; a build or upload alone is insufficient.

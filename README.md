# caseyagollan.com

Personal website built with SvelteKit 2, Svelte 5, TypeScript, and Vite. Deployed as a Cloudflare Worker with static assets using `@sveltejs/adapter-cloudflare`.

## Development

```sh
bun install
git submodule update --init --recursive
bun run dev
```

The `content/` submodule contains the canonical Markdown and media snapshot. Vite bundles Markdown for the Worker; production prerendering reuses parsed posts within the build. Development and runtime reads do not use that parsing cache.

```sh
bun test             # Regression tests
bun run check        # Svelte/TypeScript diagnostics
bun run build        # Production build, including submodule initialization
bun run preview      # Build and run Wrangler with local Cloudflare bindings
bun run preview:remote
```

Use Vite for fast development and Wrangler preview when testing KV/R2 bindings. See `.env.example` for configuration names; keep credentials in ignored files.

## Deployment

Cloudflare Workers Builds watches this repository. Production uses `bun run build`, followed by `bun run wrangler deploy`; branches use `bun run wrangler versions upload`. SvelteKit generates its fetch handler and static assets in `.svelte-kit/cloudflare/`; `worker.mjs` delegates requests to that handler and adds the publishing-delivery cron. `wrangler.sveltekit.jsonc` controls adapter output so it cannot overwrite the source wrapper. `wrangler.jsonc` defines routes and runtime bindings.

Build caching is enabled. Both triggers exclude documentation, tests, and agent planning metadata from starting builds: `docs/*`, `tests/*`, `.superpowers/*`, `README.md`, `AGENTS.md`, `PLAN.md`, and `TODO.md`. Application source, static assets, the content submodule pointer, lockfile, and configuration continue to trigger builds. Trigger settings live in Cloudflare, not Wrangler configuration.

For a manual deployment use `bun run deploy` (builds first). For a packaging check use `bun run build` and `bun run wrangler deploy --dry-run`.

## Library management

Export JSON from [LibraryThing](https://www.librarything.com/export) to `utils/librarything_caseygollan.json`, run `bun run update-library`, and optimize downloaded covers in `static/library/img/`. The script writes `static/library/graph.json` and cover images.

## Repository layout

- `src/`: application routes, components, post parsing, and API handlers.
- `content/`: canonical content Git submodule.
- `static/`: public assets, including the library dataset and covers.
- `utils/`: library import script and its source export.
- `tests/`: regression coverage.
- `docs/`: implementation plans and evidence.

Legacy Eleventy source/output, the nested starter app, duplicate content trees, and obsolete agent workspaces were removed. Tracked historical versions remain in Git history.

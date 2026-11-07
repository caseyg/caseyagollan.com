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

Search uses Pagefind, generated automatically before the Vite production build from public posts and the local book catalog. Run `bun run build:search` before `bun run dev` to enable search locally, and rerun it after content changes. Pagefind’s official Component UI supplies the magnifying-glass trigger, modal, input, results, and type filter. ⌘/Ctrl K opens the overlay and Escape closes it. Results can be filtered by post type or book. Book search covers available catalog text and metadata, not the contents of the books. Generated `static/pagefind/` files are ignored by Git and copied into the Worker assets during the build.

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

### Saved Bluesky and Mastodon posts

Likes and reposts fetch a public post once during Micropub publication and save a snapshot in `_micropubSocialSnapshots` in the same GitHub Markdown commit. Archive cards, permalinks and feeds render the saved text, author, timestamp, images, and link preview cards without social widgets or browser API requests. The author/avatar layout follows Bluesky while retaining the site’s colors and white underlined links. Unrelated edits preserve the snapshot; changing/removing the target discards its old snapshot. Failed fetches retain a plain link. Private and unlisted Mastodon posts are not archived.

Avatars and attached raster images are saved in the existing `PUBLISHING_MEDIA` R2 bucket under immutable content-hash keys (`publishing/social/…`), served through `PUBLISHING_MEDIA_BASE_URL` or the existing `/media/` route. Git stores only their URLs. Fetches are bounded to 1 MiB per image and 5 MiB per post; oversized/unavailable media and video are omitted, with the original post linked. Saved post text is excluded from outgoing syndication text and additional Webmention targets.

Backfill the canonical content checkout, then commit its changes in the content repository and update the site's submodule pointer:

```sh
# Dry run all likes and reposts
bun run backfill-social-snapshots
# Save one existing post
bun run backfill-social-snapshots content/likes/2026-11-06-c1d5be8d.md --write --remote-media
# Explicitly refresh a previously saved snapshot
bun run backfill-social-snapshots content/likes/2026-11-06-c1d5be8d.md --refresh --write --remote-media
```

Dry runs do not write to R2. Saving requires `--write --remote-media`, which uploads public images to the configured remote R2 bucket before saving their URLs in Markdown. Failed refreshes retain each unavailable original snapshot. The backfill command never commits, pushes, or deploys. Rendering and ordinary builds use the saved snapshot; they do not refresh social content.

Scheduled Mastodon and Bluesky imports are documented in [PESOS](docs/indieweb-publishing/PESOS.md), including ten-minute polling, deduplication, credentials, and historical backfill.

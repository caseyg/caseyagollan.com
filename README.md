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

Search uses Pagefind, generated automatically before the Vite production build from public posts, the local book catalog, and published cag.wiki Markdown pages. Run `bun run build:search` before `bun run dev` to enable search locally, and rerun it after content changes. Pagefind’s official Component UI supplies the magnifying-glass trigger, modal, input, results, and type filter. ⌘/Ctrl K opens the overlay and Escape closes it. Results can be filtered by post type, book, or wiki. Wiki indexing fetches fresh Obsidian Publish metadata and Markdown at build time, includes only URLs listed in the cag.wiki sitemap, and links results to cag.wiki. A wiki fetch failure fails the build to avoid publishing an incomplete index. Book search covers available catalog text and metadata, not the contents of the books. Generated `static/pagefind/` files are ignored by Git and copied into the Worker assets during the build.

## Deployment

Cloudflare Workers Builds watches this repository. Production uses `bun run build`, followed by `bun run wrangler deploy`; branches use `bun run wrangler versions upload`. SvelteKit generates its fetch handler and static assets in `.svelte-kit/cloudflare/`; `worker.mjs` delegates requests to that handler and adds the publishing-delivery cron. `wrangler.sveltekit.jsonc` controls adapter output so it cannot overwrite the source wrapper. `wrangler.jsonc` defines routes and runtime bindings.

Build caching is enabled. Both triggers exclude documentation, tests, and agent planning metadata from starting builds: `docs/*`, `tests/*`, `.superpowers/*`, `README.md`, `AGENTS.md`, `PLAN.md`, and `TODO.md`. Application source, static assets, the content submodule pointer, lockfile, and configuration continue to trigger builds. Trigger settings live in Cloudflare, not Wrangler configuration.

For a manual deployment use `bun run deploy` (builds first). For a packaging check use `bun run build` and `bun run wrangler deploy --dry-run`.

## Library management

Export JSON from [LibraryThing](https://www.librarything.com/export) to `utils/librarything_caseygollan.json`, run `bun run update-library`, and optimize downloaded covers in `static/library/img/`. The script writes `static/library/graph.json` and cover images.

Run `bun run update-library-metadata` to save Open Library descriptions and subjects in `static/library/metadata.json`. The sidebar and search build share this checked-in cache; page views and builds never call Open Library. Existing descriptions are kept indefinitely without refetching; successful lookups with no description are retried after 30 days. Books without ISBNs keep catalog categories. The importer batches ISBN and work lookups, identifies itself as `caseyagollan.com (caseygollan@gmail.com)`, and limits requests to two per second (below Open Library’s identified limit of three). It checkpoints each completed batch atomically and stops on API errors without caching failures. Run `bun utils/update-library-metadata.ts` to refresh catalog categories offline. Rebuild search after updating metadata. LibraryThing’s `summary` is a catalog citation, not a full description.

Run `bun run update-library-covers` to find large Open Library covers and upload improvements to the existing `PUBLISHING_MEDIA` R2 bucket under `library/covers/`. It uses the configured public media domain, checkpoints each upload, skips cached covers, and retries missing/non-improving covers after 30 days. Existing local covers remain in the overview; the selected book loads the larger R2 image through a same-origin route and releases that texture when selection changes. Search results also use the saved R2 covers. The importer uses the existing Cloudflare account/token environment variables and never deploys the site.

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

Dry runs do not write to R2. Saving requires `--write --remote-media`, which uploads public images to the configured remote R2 bucket before saving their URLs in Markdown. Temporary network failures retain saved outer snapshots; confirmed deleted or restricted originals are removed on refresh. Missing or restricted quoted posts never reuse archived copies. The backfill command never commits, pushes, or deploys. Rendering and ordinary builds use the saved snapshot; they do not refresh social content.

Scheduled Mastodon and Bluesky imports are documented in [PESOS](docs/indieweb-publishing/PESOS.md), including ten-minute polling, deduplication, credentials, and historical backfill.

### Manual syndication

Append `/syndicate` to any dated post permalink to open its syndication editor.
Sign in through `/account` with your existing passkey, choose Bluesky, Mastodon,
or both, edit the separate drafts, and send. The editor reads current GitHub
content and saved delivery receipts to show existing social links. Independently
published copies without saved links are not discovered by searching social accounts.
This uses the native text-and-link syndicators; photos, video, and audio stay on
the original page. Only published public posts can be syndicated here.

The editor requires the existing internal owner authentication, `PUBLISHING_STATE`,
GitHub publishing credentials, and credentials for each offered social destination.
Manual sends work independently of the automatic delivery cron's enable switch.
They share the automatic syndication receipts, so simultaneous/manual/automatic
requests do not create duplicate posts. Drafts are recorded before sending and
retained for any safe delivery retry. Uncertain sends remain blocked in the editor
pending account review or reconciliation by the existing delivery workflow.

Successful social URLs are added to the source Markdown's `syndication` metadata
in the GitHub content repo. If the GitHub update fails, **Sync links to original
post** retries that update from saved receipts without sending another social post.

### Import social archives

Run `bun utils/import-social-archive.ts /path/to/repo.car` for a Bluesky repository
export, or pass an extracted Mastodon `outbox.json` or `likes.json`. Multiple archive paths can be passed in one run. The command
previews changes; add `--write` to apply them to the initialized `content/`
checkout. ZIP files must be extracted first. Review and commit content changes
separately before publishing.

Imports share the polling job's source/action identities and normalize Bluesky
handle aliases. Likes and reposts remain separate actions. Matching imported
likes/reposts have their date corrected in place, preserving their filename,
body, and other metadata. Archive activity timestamps take precedence; otherwise
the original post timestamp is used. No outbound syndication is requested.

Every new import must pass an anonymous live public-access check. Mastodon
unlisted/private/direct posts and locked accounts are excluded; Bluesky blocked,
missing, hidden, taken-down, and no-unauth posts/accounts are excluded. Failures
are skipped and can be retried by rerunning the archive. A public archive entry
alone is insufficient evidence: missing/deleted live posts are never restored
from archive content. URL-only Mastodon likes use the original post time;
Announce records retain the actual repost time. Live absolute media URLs replace
archive-relative attachment paths. Previously published content is not removed by
this command. The CLI should run against a fresh content checkout while the
polling job is paused; its local writes do not acquire the production R2 lease.


Social snapshots include native quoted posts (up to three nested levels), with
independent public-author checks, R2 images and link previews at every level.
Quoted text and authors are included in site search without creating another
like, repost or site entry. New polling imports use this same capture path,
including quotations in your authored posts.

To upgrade existing cards and archive original photos:

```sh
bun run backfill-social-snapshots --write --remote-media --refresh --concurrency 8
bun run backfill-social-snapshots --write --remote-media --own-images --concurrency 8
```

Backfill requests share job-local caches and per-host API budgets, honor quota
reset headers, and reuse content-addressed R2 objects. Use `--platform bluesky`
or `--platform mastodon` to narrow the work, `--limit N` for a sample, and
`--resume-after ISO_TIMESTAMP` to skip already-refreshed snapshots. Remote uploads
use the configured Cloudflare account and an existing token with R2 object-write
permission; no media bytes are written to Git. Original photos retain their
quality and alt text; photos that cannot be safely fetched remain at their
existing URL. Review and commit Markdown separately before publishing.

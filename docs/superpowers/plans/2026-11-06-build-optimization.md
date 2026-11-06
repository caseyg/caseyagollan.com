# Build optimization implementation plan

**Goal:** Reduce avoidable Cloudflare builds and measured compilation work; remove obsolete site copies.

**Architecture:** Preserve SvelteKit prerendering, the content submodule, current routes, and Cloudflare Worker bindings. Cache parsed posts only during production builds, never during development or runtime fallback requests. Keep Cloudflare dependency caching enabled.

**Authorization:** User approved the audit recommendations and removal of the entire Eleventy archive on November 6, 2026. Implement in the current feature checkout while preserving the existing post-fallback changes; no production deployment or merge is needed for this task.

## Tasks

- [x] Record a build/output baseline, inventory legacy content, and check references before removal.
- [x] Remove `archive`, `_site`, the starter `my-svelte-app`, duplicate `src/content`, old Eleventy cache, obsolete backups, and browser-test screenshots. Preserve the content submodule, current static assets, and unrelated local work.
- [x] Measure repeated post reads; add production-build-only shared parsing with regression coverage for concurrency and uncached development reads. Preserve the post-fallback parser refactor already in progress.
- [x] Profile visualization dependencies and benchmark reduced import surfaces. Keep changes only with demonstrated compilation or bundle benefit.
- [x] Benchmark compressed-size reporting and local Wrangler invocation. Do not introduce a less-supported Wrangler runtime for negligible savings.
- [x] Configure and read back Cloudflare watch exclusions for documentation and development metadata, with source, assets, submodule pointer, dependencies, and configuration still triggering builds.
- [x] Run tests, checks, production build and packaging; compare prerendered output and exercise homepage, library, posts, tag and date routes. Record measurements and existing check failures separately.

## Verification and risks

Use local repeated warm builds for relative measurements; these are not predictions of Cloudflare wall time. Compare generated static route paths and hashes of prerendered data before and after. A build-scoped cache must not hide content edits in development. Legacy deletion must leave the current content and library assets intact. Do not change the current branch's uncommitted fallback behavior, secrets, or production traffic.

## Progress

Inventory: `archive/content` and `src/content` each contain 36 files byte-identical to the current submodule. All 374 archive library images match current assets; the legacy graph differs. The nested app is the default Welcome to SvelteKit scaffold. No current application references the deleted directories.

Initial sandboxed build was blocked by the adapter's localhost listener; rerunning with approved local-listener access.

Results and verification: [2026-11-06-build-optimization-results.md](2026-11-06-build-optimization-results.md). Gzip reporting was benchmarked and retained; unnecessary Three.js work was ruled out by profiling.

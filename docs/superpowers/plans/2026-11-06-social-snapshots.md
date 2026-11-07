# Saved Social Posts Implementation Plan

> **For agentic workers:** Use executing-plans to implement task by task.

**Goal:** Persist and statically render liked/reposted Bluesky and Mastodon posts.
**Architecture:** Reserved YAML metadata travels through the existing GitHub content write. Shared rendering serves cards, permalinks, and feeds. An explicit Bun command backfills existing Markdown.
**Tech Stack:** Existing Bun, TypeScript, Svelte, YAML, and HTML sanitizer; no new packages.
**Spec:** docs/superpowers/specs/2026-11-06-social-snapshots-design.md

## Global Constraints
Preserve the content submodule, dates, permalinks and development freshness. No live widgets, remote images, or API calls during rendering. Use the bounded public transport. Snapshots must fit the existing 1 MiB document limit.

## Review Focus
- Hostile remote HTML and image types: sanitize markup and allow only bounded raster images in R2.
- Missing/private/deleted posts: retain links, never save nonpublic Mastodon posts.
- Changed or removed targets: prune stale snapshots; preserve unrelated snapshots without refetching.
- Invalid or partial API data: fail softly, never break publication.
- Existing posts: backfill explicitly and verify the requested permalink locally.

### Task 1: Snapshot fetching and persistence
Files: src/lib/server/publishing/social-snapshots.ts, src/lib/social-snapshots.ts, tests/social-snapshots.test.ts.
Interface: enrichSocialSnapshots(markdown, fetcher?) => Promise<string>; snapshot metadata is _micropubSocialSnapshots.
- [x] Write tests for Bluesky/Mastodon API responses, saved R2 images, private posts, failed fetches, target edits and hostile content; observe failure.
- [x] Implement normalization, bounded image persistence, reserved metadata, and target matching. User refinement: persist avatars and images through src/lib/server/publishing/social-media.ts using the existing R2 binding, with only object URLs in Git.
- [x] Run snapshot tests; expect pass.

### Task 2: Publishing and rendering
Files: micropub.ts, parse-post.ts, posts-types.ts, post-details.ts, PostDetails.svelte, publication.ts, tests/micropub.test.ts.
Interface: Post.socialSnapshots contains normalized snapshots; renderSocialSnapshot returns safe static HTML.
- [x] Add rendering and handler tests; observe failure.
- [x] Enrich before GitHub writes; render saved snapshots for both relationship types, retaining microformat links and fallback.
- [x] Run tests; expect pass.

### Task 3: Backfill and verification
Files: utils/backfill-social-snapshots.ts, package.json, README.md.
- [x] Add explicit file/all-content backfill command with dry run default and explicit --write --remote-media options.
- [x] Test requested existing post using canonical content and live APIs; inspect local rendered HTML.
- [x] Run bun test, bun run check, bun run build, git diff --check; report baseline failures separately.

## Completion evidence

- Implemented and reviewed in the existing isolated worktree. R2 refinements and layout corrections came directly from the user during implementation.
- 216 Bun tests pass; project check has zero errors and the same five baseline warnings; production build and diff whitespace checks pass.
- Backfilled content/likes/2026-11-06-c1d5be8d.md locally. Its saved avatar and collage were uploaded to the existing remote R2 bucket; both public URLs return HTTP 200 with immutable caching. No image bytes remain in Markdown.
- Inspected the built permalink and posts archive in the browser. Static output contains the card on the permalink, posts, likes and date routes. Homepage, library and tag output also build.
- Independent review found two delivery/refresh issues, fixed with regressions; a follow-up media-refresh finding was also fixed and tested.

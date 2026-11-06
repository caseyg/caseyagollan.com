# Same-URL Post Fallback Implementation Plan

**Goal:** Render published posts missing from the current static build at their existing URL.
**Architecture:** Use prerender auto on the permalink route, a shared Markdown parser, and a
server-only GitHub loader. Bundle local Markdown with Vite raw imports; use no filesystem APIs at runtime.
**Tech stack:** SvelteKit, Cloudflare Worker, YAML, Bun tests.
**Spec:** docs/superpowers/specs/2026-11-06-post-fallback-design.md

- [x] Add failing tests for GitHub Markdown loading, media/timezone preservation, invalid paths,
  absent posts and upstream failures.
- [x] Extract parser from src/lib/posts.ts into src/lib/server/parse-post.ts and add
  src/lib/server/github-posts.ts with bounded GitHub requests.
- [x] Enable prerender auto on the dated permalink route, using local content during builds
  and GitHub at runtime; prevent caching dynamic successes and errors.
- [x] Run all tests, Svelte checking, production build and a local Worker request.

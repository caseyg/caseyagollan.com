# Complete publishing implementation plan

> **For agentic workers:** Use parallel-agent execution for independent feed and rich-HTML components, then integrate delivery/publishing sequentially and obtain fresh review.

**Goal:** Finish the non-CMS publishing plan, keeping production cutover deliberate.
**Architecture:** Existing SvelteKit/Git content, explicit sanitized formats, public feeds, private R2 outbox, native scheduled Worker delivery. No D1.
**Tech Stack:** Bun, TypeScript, SvelteKit, Cloudflare Workers/R2, GitHub Actions.
**Spec:** docs/superpowers/specs/2026-11-06-publishing-completion-design.md

## Global constraints

- Preserve existing canonical content pointer, in-progress changes, and ignored local research snapshots.
- Keep remote sends disabled in preview; no unsolicited messages/posts to others.
- Secrets stay outside source/logs; private content must never reach public Git/media.
- Public dates/permalinks/metadata and existing format behavior must survive.

## Review focus

- Feeds/rendering must never leak drafts/deleted/private content or executable HTML.
- Conflicting writes and stale jobs must not overwrite newer content or duplicate remote posts.
- Discovery/fetches must not access private network targets or leak provider credentials on redirects.
- Delivery must prove the intended revision is public, including old static pages and deletion.
- Every external setup gap must be reported separately from code completion.

## Tasks

1. Feeds: write failing serialization/filtering tests; implement shared serializers and RSS/Atom/JSON routes plus discovery; verify with Bun tests.
2. HTML: write failing sanitization/format tests; implement parser-based sanitizer and strict HTML format handling; expose helpers to publishing integration; verify Worker bundling.
3. Durable delivery: implement public-fetch restrictions, outbox CAS/leases/retries, publication proof, Webmention discovery/delivery, Mastodon/Bluesky idempotency; tests use fake networks and real local R2 where valuable.
4. Integrate: syndication discovery/requests/results, exact revision markers, Worker scheduled wrapper and bindings; honor clarification on private drafts.
5. Workflow/cutover preparation: direct-Git notifications, preview discovery, setup and status; activate/test only authorized remote targets.
6. Verify: full tests, check baseline, build, Wrangler packaging, local runtime, preview integration, independent review. No CMS.

## Completion evidence

- Implemented RSS/Atom/JSON feeds and discovery, safe rich HTML, Git drafts, stale-edit protection, public revision manifest, durable outbox, outgoing Webmentions, Mastodon/Bluesky adapters and protected credentials/configuration.
- CMS and private posts excluded per user. Current syndication sends text+canonical link; independent social copies are not automatically edited/deleted.
- 130 tests / 505 assertions pass. Svelte/TypeScript reports zero errors and five baseline warnings; production build and both Wrangler packaging checks pass.
- Real local workerd/R2 tests verify 25 MiB uploads, media reads/ranges/HEAD/conditional GET, concurrent outbox CAS claims, checkpoints and completion deduplication. Actual wrapper serves feeds and handles disabled cron locally.
- Preview live HTML create/source/render/edit/delete/restore checks pass; all three feeds and manifest parse; tag/date/permalink routes load. Codex browser verified homepage, posts and library.
- Existing social credentials securely migrated from Railway to preview; read-only Mastodon account and Bluesky session/repository checks pass. Delivery stays disabled; no social posts/Webmentions sent.
- Review fixes: durable generations for repeated delete/restore; actionable index separate from retained history; shared transition intents prevent duplicate request/manifest jobs. Focused independent review confirms fixes.
- Rollout remains: activate merged site/content workflows; install production secrets/build discovery settings; persist production enable flags; authorize and verify live client/media/draft/social tests. Production Worker and canonical submodule pin unchanged.

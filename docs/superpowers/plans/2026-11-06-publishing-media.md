# Publishing media implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement task by task.

**Goal:** Add isolated R2 publishing uploads, IndieKit-compatible restore, and a reviewable content-to-build workflow.
**Architecture:** Use the existing publishing auth and Git store; separate R2 bindings serve public media through the Worker. GitHub Actions advances the canonical content submodule and Cloudflare builds that revision.
**Tech Stack:** SvelteKit 2, TypeScript, Bun, Cloudflare R2/Workers, GitHub Actions.
**Spec:** docs/superpowers/specs/2026-11-06-publishing-media-design.md

## Global constraints

- Preserve unrelated work and the canonical content submodule.
- Use pinned dependencies and Bun; leave production publishing/discovery unchanged.
- At most 25 MiB per image/video/audio upload; separate preview bucket.
- No credentials in source, logs, or commits.

## Review focus

- Chunked/lying request sizes must still be bounded before storing.
- Spoofed media types and active SVG/HTML must be rejected.
- Media permission cannot be inferred from create; restore requires delete.
- Range/conditional reads must not expose other bucket keys.
- Stale/out-of-order content dispatch cannot roll production backward or select preview content.

## Tasks

1. Restore: add failing tests for delete-scope restore and create/update-only rejection; map undelete authorization to delete; run auth/HTTP tests.
2. Media: add failing upload/serving tests; implement bounded multipart upload, safe media type validation, R2 storage and GET/HEAD/ranges; wire routes/bindings/discovery and photo/video posts; run media/document/HTTP tests.
3. Build workflow: add revision-selection/validation tests; implement the submodule update script and GitHub workflows/template with race protection, exact revision validation, and setup documentation. Leave cross-repository credential setup explicit.
4. Verify: Bun suite, typecheck, build, type generation, dry-run; configure only the preview R2 bucket and live-test create/upload/render/edit/delete/restore. Review diff and report production setup gaps.

## Verification and remaining activation

- Complete: restore with delete scope, guarded media upload/serving, photo/video writes, form alt text, site sync workflow and content notifier template.
- 80 Bun tests pass; Svelte check reports zero errors and five existing warnings. Production build and both Wrangler packaging checks pass.
- Local workerd/R2 tests pass for multipart upload through 25 MiB, exact reads, HEAD, conditional GET, and ranges.
- Live preview passes photo create/read/render/edit/delete/restore, remote R2 exact bytes and ranges, upload 401 without auth, and upload 403 with the old non-media token.
- Preview and empty production media buckets exist. Production Worker/discovery remain unchanged; canonical submodule pin remains unchanged.
- The workflow stages the selected gitlink before prebuild; a real Git/submodule regression test verifies prebuild cannot reset it. Independent review reports no remaining important findings.
- Remaining activation: merge site workflow, install content notifier/credential for immediate dispatch, verify a real Cloudflare build, configure production publishing/discovery, and perform a live upload with a new media-scope token.
- Scope correction: there is no RSS/Atom feed route in this checkout. Feed generation remains separate work; rebuilds alone do not add it.

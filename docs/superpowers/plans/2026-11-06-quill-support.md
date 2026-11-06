# Quill Support Implementation Plan

**Goal:** Implement the approved Quill payloads except weight and private visibility.
**Architecture:** Extend Git-backed YAML documents and a shared structured-post model/render helper. Reuse the helper in Svelte, feeds, and delivery.
**Tech Stack:** Existing Bun, TypeScript, SvelteKit, YAML and HTML sanitizer.
**Spec:** ../specs/2026-11-06-quill-support-design.md

## Constraints and review focus

Preserve dates/permalinks, authentication, public filtering, and canonical content. No production writes. Verify nested unsafe URLs/HTML, partial edits, Markdown source fidelity, channel round trips and structured-only delivery revisions.

- [x] Add failing HTTP regressions for Quill types, channels, Markdown, private/weight rejection and updates.
- [x] Extend document metadata/source and endpoint validation; validate final merged updates.
- [x] Add shared structured-post model and safe rendering; update parser, collections, archive/detail components, feeds and publication delivery.
- [x] Add parser/render/feed/delivery regressions, run full tests, compare diagnostics and build.
- [x] Check representative local routes and review changes.

Execution: inline as requested by the user's “do it”.

Verification: 199 tests pass; check matches baseline (0 errors, 5 existing warnings). Production build passes with the Cloudflare adapter. Browser checked local main/tag/date/type archives and event/review permalinks using temporary fixtures; fixtures were removed and canonical content is unchanged. Review caught two Markdown source editing cases, now covered and fixed. Official Quill event source confirmed conference references contain name and URL without dates; nested conference dates are optional. No deployment or live publishing writes.

Delivery compatibility: existing posts without new structured fields retain their original revision hashes (verified against the pre-change implementation); structured edits change revisions even when their display text is unchanged.

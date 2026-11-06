# Publishing foundation implementation plan

**Goal:** Implement the first slice of [the publishing design](../../indieweb-publishing/DESIGN.md): lossless document editing and revision-checked Git writes. No public endpoints or production writes yet.

**Architecture:** Pure document helpers preserve YAML and body source. A Fetch-based GitHub adapter reads/writes one allowed content file using a blob SHA precondition. Existing public readers remain unchanged.

**Stack:** Bun tests, TypeScript, installed `yaml`, Worker Web APIs.

## Constraints

- Preserve unrelated working-tree edits, canonical submodule, existing metadata and local dates.
- No new dependencies or D1; no runtime filesystem/Buffer requirement.
- Keep publishing code disconnected from public routes until auth/publication filtering is implemented.

## Review focus

Malformed YAML or duplicate keys must fail before saving; mixed updates must preserve unrelated nested values; plain/HTML content must round-trip explicitly; unsafe paths and foreign URLs must be rejected; ambiguous writes and conflicts must never cause automatic overwrites/retries.

## Tasks

- [x] Add `tests/publishing-document.test.ts`, run it failing, implement `src/lib/server/publishing/document.ts`, then rerun. Interfaces: `readDocument(markdown)` returns a document with source properties; `updateDocument(markdown, operations)` returns Markdown; `createDocument(properties)` creates a document. Test comment/unknown-field preservation, exact timestamps, mixed replace/add/delete, nested values, text/HTML source, malformed input, and URL-changing date edits.
- [x] Add `tests/publishing-github.test.ts`, run it failing, implement `src/lib/server/publishing/github.ts`, then rerun. Interface: `createGitHubStore(config, fetcher)` returns `read(path)` and `write(path, content, {sha?, message})`. Test exact branch/path/SHA handling, Unicode without Buffer, 404 vs upstream failure, conflicts, safe paths, timeouts, and no automatic retries.
- [x] Run `bun test`, record baseline versus final `bun run check`, run `bun run build`, and request independent review of the new modules/tests. Record outcomes here.

## Progress

Baseline: 12 tests passed. Initial check could not start without installed dependencies; resolved by installing the locked dependencies. Workspace is an existing externally managed detached worktree. Implementation authorized in chat; proceed inline.

Locked dependencies installed without changing package/lock files. Installed diagnostic baseline: 71 errors and 5 warnings in existing files. Final tests: 31 pass, 0 fail; diagnostics match the baseline exactly.

Independent source review found legacy content deletion/addition errors, unsupported legacy photo metadata, and an alias collision. Added three failing regression tests and fixed them; full suite passes. Legacy Markdown remains explicitly marked as Markdown source; a future protocol handler must render it for `q=source`. New plain-text/HTML documents carry a format marker that future rendering must honor before enabling writes.

The first build required sandbox escalation for Git submodule setup and a local SvelteKit build socket. No production API writes, deployments, or changes to existing public readers were made. Existing unrelated `.env.example` and fallback design edits were preserved.

Final production build passed after the review fixes. Git whitespace checks passed. The new modules are verified by local tests; their live GitHub write path remains unexercised.

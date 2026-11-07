# IndieAuth implementation plan

> Use parallel agents for independent state, protocol and account UI components, then integrate and independently review.

**Goal:** Remove the remaining IndieKit authentication dependency without prematurely switching production.
**Architecture:** Existing Worker wrapper and SvelteKit; dedicated SQLite Durable Object; SimpleWebAuthn passkeys; hashed opaque tokens; native binding introspection.
**Spec:** docs/superpowers/specs/2026-11-06-indieauth-design.md

1. Define shared RPC operations/settings and implement pure state logic + native DO wrapper with transactional single-use code exchange, credentials, sessions, tokens, cleanup and rate limits. Tests first.
2. Implement protocol validation/routes/metadata, owner API, cookies/CSRF and error mapping; use the shared RPC contract and fake store in tests.
3. Build account sign-in/setup/consent/token UI with maintained browser WebAuthn helpers; no credentials in URLs or source.
4. Integrate internal token validation, DO export/bindings/migrations, independent auth discovery configuration, and protected bootstrap tooling.
5. Run full checks/build, real runtime integration and independent security/correctness review. Deploy only preview; guide the user through native passkey enrollment and verify authorization→publish→revoke before production cutover.

## Constraints

Preserve all current work, canonical submodule pin, ignored local research snapshots and staged untracking. Use Bun and exact new dependency versions. No CMS/private posts. No production discovery change or IndieKit decommission until verified. No Ego Lite: use Codex browser.

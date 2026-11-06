# Reusable projects and adaptation findings

2026-11-06. Primary evidence is the commit-pinned repository snapshot in `research/repos/`; exact SHAs and upstream commit links are in [the inventory](research/INVENTORY.md). Findings below distinguish inspected code from README descriptions. A recent push or permissive license does not establish correctness, maintenance quality, or production readiness.

## Closest matches

### benjifs/micropub — first Git-backed adaptation candidate

[GitHub](https://github.com/benjifs/micropub) · MIT · package snapshot `@benjifs/micropub` 2.0.1.

Inspected `src/index.js`, `content.js`, `auth.js`, `parseBody.js`, README, and package declaration. The endpoint separates storage behind an object, validates against an external token endpoint, handles create/update/delete/undelete, and returns source/configuration queries. This is a useful small starting point for our existing Markdown workflow.

Concrete adaptation work:

- Multipart parsing uses `node:stream`, `node:buffer`, and Busboy. Replace or verify this against the actual Worker compatibility configuration; do not assume a Netlify function package runs unchanged here.
- `handleUpdate` returns after the first present `add`, `delete`, or `replace` operation. A combined update needs all operations applied in the specification's order.
- Content and JF2 are logged. Remove payload logging before using it for private drafts or sensitive content.
- Auth validation does not explicitly check `res.ok`/`active` before trusting returned identity; review against the selected provider's verification contract.
- `q=source` requires a URL; post-list queries need additional support if desired. Media uploads currently pass through the same store abstraction. Adapt R2 delivery URLs, dated permalinks, metadata round-tripping, and public draft/deletion filtering.

Evidence: [handler](research/repos/benjifs--micropub/files/src/index.js.txt), [content operations](research/repos/benjifs--micropub/files/src/content.js.txt), [auth](research/repos/benjifs--micropub/files/src/auth.js.txt), [multipart parser](research/repos/benjifs--micropub/files/src/parseBody.js.txt).

### benjifs/github-store — companion Git adapter

[GitHub](https://github.com/benjifs/github-store) · MIT · package snapshot 0.2.0.

README and package inspection: dependency-free adapter for GitHub Contents API, used by the Micropub package. Useful for a narrow repository-writing layer rather than adopting a complete CMS. Review implementation, SHA conflict handling, retries, file-size limits, and commit permissions before adoption. A repository Contents API is not a durable job queue, and media should use a separate R2 strategy if we keep binaries out of Git.

Evidence: [README](research/repos/benjifs--github-store/files/README.md), [package](research/repos/benjifs--github-store/files/package.json). Runtime implementation has not been reviewed here.

### davidwkeith/workers — strongest native Workers package candidate

[GitHub](https://github.com/davidwkeith/workers) · ISC · Micropub package snapshot 1.0.0-beta.8.

Inspected package READMEs/configuration, Micropub handler/store, and IndieAuth hook types. Implements D1-backed Micropub and R2 media; includes auth and Webmention packages. Protocol and storage tests are present but were not run here.

Important fit constraints: the Micropub handler constructs its D1 store directly; an exported store interface is not a ready-made Git adapter injection point. It is coupled to the cohort's issued-token store/signing setup. DPoP is the default; enable and test both IndieAuth `bearerTokens` and Micropub `acceptBearerTokens` for ordinary clients. IndieAuth requires a supplied owner-login/consent hook. Private-post metadata is not itself access control for public rendering.

Prefer evaluating it if D1 becomes canonical. For Git, selectively reuse pure parsing/update helpers or assess an upstream storage seam. Avoid importing its unrelated protocol surface by default.

Evidence: [Micropub README](research/repos/davidwkeith--workers/files/packages/micropub/README.md), [handler](research/repos/davidwkeith--workers/files/packages/micropub/src/handler.ts.txt), [store](research/repos/davidwkeith--workers/files/packages/micropub/src/store.ts.txt), [auth configuration](research/repos/davidwkeith--workers/files/packages/indieauth/src/config.ts.txt).

### dumaurier/ElevindieWeb — concrete Cloudflare/Git reference

[GitHub](https://github.com/dumaurier/ElevindieWeb) · MIT.

Inspected Cloudflare Functions, request parsing, frontmatter mapping, token exchange, and auth verification. It demonstrates Git-backed publishing, IndieAuth, and optional social syndication in one project. Its routing/build setup is Pages Functions and Eleventy, so adapt handlers to SvelteKit `+server.ts` or Worker Fetch handlers rather than copying deployment configuration.

The small footprint has limits: auth codes are consumed through separate KV `get` and `delete` calls, not an atomic single-use operation; revocation also relies on KV. Design a strongly consistent auth state path. Frontmatter writers select a narrow string-property set, so nested/unknown property round-tripping needs explicit treatment. Multipart uploads are not implemented by the inspected body parser. Identity comparison uses origins, which is broader than matching the canonical owner profile URL.

Useful as an example, not a security-reviewed auth foundation.

Evidence: [token exchange](research/repos/dumaurier--ElevindieWeb/files/functions/_lib/indieauth/token.ts.txt), [auth checks](research/repos/dumaurier--ElevindieWeb/files/functions/_lib/auth.ts.txt), [body parser](research/repos/dumaurier--ElevindieWeb/files/functions/_lib/utils/parse-body.ts.txt), [frontmatter mapping](research/repos/dumaurier--ElevindieWeb/files/functions/_lib/mapping/micropub-to-fm.ts.txt).

## Building blocks and interoperability references

| Repository | What to take from it | Limit / evidence boundary |
|---|---|---|
| [grantcodes/micropub](https://github.com/grantcodes/micropub) | `micropub-helper`: typed JS client helper for an eventual custom editor | Package declares MIT; client-side helper, not an endpoint. README/package reviewed; Workers/browser behavior untested. |
| [microformats/microformats-parser](https://github.com/microformats/microformats-parser) | TypeScript MF2 parser for HTML extraction and template checks | MIT; package uses parse5 and declares Node >=22. Test Worker bundling before choosing it for runtime parsing. Sanitization remains separate. README/package reviewed. |
| [microformats/tests](https://github.com/microformats/tests) | CC0 parsing fixtures for cross-implementation behavior | Fixture reference, not a CMS. Only README/tree/metadata captured, not the full fixture set. |
| [benjifs/serverless-webmentions](https://github.com/benjifs/serverless-webmentions) | Queued receive/verify flow and importing existing webmention.io data | MIT; documented deployment uses Netlify and scheduled processing. README reviewed; fetch safety, duplicate handling, and moderation need source/runtime review. |
| [aaronpk/Quill](https://github.com/aaronpk/Quill) | Independent client to test discovery, authorization, posting/media; UX reference | PHP + MySQL/SQLite. README declares Apache-2.0 although GitHub license detection is absent. No server/client code runtime audit here. |
| [barryf/micropublish](https://github.com/barryf/micropublish) | Independent editing client with request preview and delete/undelete workflows | MIT; Ruby application, not a static browser app. README/tree reviewed. |
| [rmdes/micropub-mcp](https://github.com/rmdes/micropub-mcp) | Optional Bun/TypeScript Micropub client for agent-assisted publishing | Client only. GitHub license detection absent; confirm reuse rights before copying. README/package reviewed. |
| [valpackett/micro-panel](https://github.com/valpackett/micro-panel) | Lit editor/web-component interaction reference | Unlicense; archived. Old `unrelentingtech` URL redirects here. README expects cookie/session auth instead of normal IndieAuth; unsuitable as-is for our interoperability goal. |

## Broader references, weaker migration bases

**[getindiekit/indiekit](https://github.com/getindiekit/indiekit)** (MIT): preserve it as the feature/storage-format baseline, especially preset mapping and syndication semantics. Captured tree, README, package, and license; individual endpoint implementation not audited in this pass. It supports hosts beyond Railway, but its Node/plugin/database architecture is larger than the proposed Worker publishing layer.

**[voxpelli/webpage-micropub-to-github](https://github.com/voxpelli/webpage-micropub-to-github)** (MIT): useful Git-write precedent. README explicitly excludes partial updates and deletion. Package uses Express and older dependencies. The captured default-branch commit is from 2023 despite a 2026 repository push timestamp; do not infer a recent implementation update from that push. Reference rather than first port candidate.

**[indieweb/wordpress-micropub](https://github.com/indieweb/wordpress-micropub)**: useful cross-platform behavior/extension reference, with a WordPress dependency that makes direct reuse here impractical. README and package declaration were captured; implementation not audited. Verify its component licensing before copying code; GitHub did not identify a repository license in this snapshot.

## Decision this research supports

There is existing code for every major piece. The choice is the boundary to adopt:

1. Git remains canonical: adapt the small serverless endpoint/storage model, with targeted fixes and an independent auth provider initially.
2. D1 becomes canonical: evaluate the composable Workers cohort, including its explicit Bearer compatibility mode and owner-login hook.
3. Keep IndieKit: moving hosting avoids a protocol migration, but does not achieve the same reduction in architecture.

Our recommendation is the first evaluation while the content store decision remains open. Adapting a small implementation still means owning correctness, security, and interoperability; source inspection here does not establish conformance.

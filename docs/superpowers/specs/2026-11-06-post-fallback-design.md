# Same-URL post fallback

Serve newly published IndieKit posts at their dated permalink before the next deployment.
Existing discovered posts remain prerendered; unbuilt permalinks render in the Cloudflare Worker.
At build time read local content; at runtime fetch matching dated Markdown from the default branch
of caseyg/caseyagollan-content through GitHub's Contents API. Reuse a filesystem-free parser and
existing post components. Runtime responses and misses must not be cached. Distinguish absent
posts (404) from upstream failures (503). Validate permalink parameters before constructing URLs.

## Approaches

The user selected hybrid rendering at the same URL over a separate preview route.
Making all posts dynamic would lose existing static delivery; a separate preview route would
require changing IndieKit's redirect. Archives still update on rebuild. Existing static URLs do
not preview subsequent edits. No deployment is included in this change.

## Implementation and operations

Vite bundles the local Markdown snapshot with raw imports, replacing filesystem reads so the
post route can run in the existing Worker configuration. Both rendering paths share a Worker-compatible YAML parser, preserving local timestamps.
Only posts absent from the bundled snapshot use GitHub. Requests check the supported post
folders in order, check the local date and adjacent UTC filename dates, stop at the matching
file, and share an eight-second deadline. Frontmatter must still match the requested local date.

Public repository access works without credentials. Optionally set the Worker secret
`GITHUB_CONTENT_TOKEN` to a GitHub token with read-only Contents access to this repository
for authenticated API quota. Never expose it to client code. GitHub failures return an
uncached 503; genuine missing posts return an uncached 404. Static pages remain unchanged
until the rebuild deploys. No automatic retry UI or draft preview route is included.

## Verification

- All 9 fallback regression tests pass in an isolated checkout based on current main.
- Svelte checking: 73 errors and 5 warnings in 11 existing files, equal to the baseline;
  no errors in the fallback files.
- Production build passes using a byte-identical temporary workerd executable after macOS
  killed the cached installed binary with exit 137.
- Isolated production Worker: omit notes/2026-05-06-522cc.md from the bundled snapshot;
  its permalink returns 200, includes the expected Markdown body fetched from GitHub,
  and sends Cache-Control: no-store. An impossible date returns 404 with no-store.
- No deployment performed.

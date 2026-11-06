# Quill publishing and frontend support

## Intent and constraints

Support every post type and property in the supplied Quill “What Quill sends” documentation except weight. Private posts are unsupported because content lives in a public GitHub repository. Reject non-public visibility and weight explicitly on creation and updates. Drafts continue to be excluded from public site readers, but their source remains public in GitHub.

Preserve the existing SvelteKit/Worker architecture, canonical content submodule, pinned dependencies, authentication and scopes, revision checks, local dates, stable dated permalinks, media endpoint, and configured syndication targets. This work implements and verifies code locally; it does not deploy or publish sample posts to production.

## Approach

Extend the existing Git-backed endpoint, YAML document serializer, shared post parser and frontend components. Keep nested microformats as structured data in frontmatter and preserve their source-query representation. This is the proposed approach: a parallel storage system would duplicate existing publishing infrastructure, and flattening nested fields would lose Quill editing data.

## Publishing behavior

Accept h-entry, h-event and h-review. Support notes, articles, bookmarks, likes, reposts, replies/RSVPs, photos, videos, events, reviews, itineraries, and food/drink. Preserve and validate relevant nested h-card, h-product, h-event, h-leg and h-food properties. Preserve review ratings, event dates and venue details, conference and presentation fields, transit details, and location text, geo URIs or checkin URLs.

Recognize p3k-content-type text/markdown; render and return Markdown source consistently while retaining current literal-text and HTML semantics. Accept timezone-bearing published timestamps with optional seconds as Quill sends them. Handle supported mp commands at their documented locations; commands must not leak into ordinary public properties.

Advertise supported post types and configured channels, accept channel selection, and retain it as editable metadata independently of the post's type. Default channels correspond to supported post collections. Existing syndication targets and media configuration remain authoritative. Like/repost updates retain the original permalink even when target URLs change. Source queries retain the root microformat type and structured properties.

Validate URLs, nested shapes, dates and ratings before saving. Sanitize HTML content and presentation embeds using the existing allowlist; untrusted embeds must never execute. Reject malformed or unsupported requests with useful protocol errors.

## Public presentation

Extend post types and collections so every supported type appears in date, tag, type and main archives and in GitHub fallback lookup. Use shared presentation for archives and detail pages: linked like/repost targets; RSVP and reply targets; event times, venue and conference; review item and rating; itinerary legs; food/drink names; location and presentation links/allowed embeds. Use appropriate microformats classes and retain the site's existing typography and spacing.

Feeds must contain meaningful rendered content for structured-only posts. Public visibility and draft/deletion filtering remain consistent in every reader. Weight receives no type, UI or discovery support.

## Verification

Record the existing diagnostic baseline. Add regression coverage for supplied Quill payloads, create/source/update round trips, Markdown, channels, private/weight rejection, nested validation and unsafe HTML/URLs. Run bun test, bun run check and a production build. Validate Svelte with available tooling and inspect local archive, tag, date, type and permalink pages for representative fixtures without committing generated output or fixtures to canonical content.

Publication revisions must include structured post data so edits are detected by delivery. Syndication text must describe structured-only posts, and Webmention discovery must include like/repost targets alongside existing reply/bookmark targets. Preserve existing delivery retry and post-publication checks.

Builder decisions: store root microformat type and channel command data in reserved internal metadata, while exposing their proper protocol representation in source queries. Clients cannot write reserved fields as ordinary properties. Validate the final merged document after updates, including add/delete operations. Apply HTML sanitization to nested conference content as well as top-level content and presentation embeds.

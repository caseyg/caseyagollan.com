# Saved social posts

Approved in chat: likes and reposts of Bluesky and Mastodon posts display a saved static card. Fetch on publication and save author, post text, timestamp, canonical link, and bounded images in the canonical GitHub Markdown document. Preserve snapshots on unrelated edits; replace/remove them when targets change. Backfill existing posts explicitly. Failures retain plain links; pages never fetch social APIs or load embed widgets.

## Approaches
Fetch during publication (chosen) keeps content and snapshot in one commit and preserves deleted originals. Build-time fetching alone depends on social APIs for rebuilds. Live embeds do not meet the request.

## Implementation choices
User refinement: store avatars and associated images in the existing R2 media bucket, never in Git. Save content-addressed immutable object URLs in reserved YAML metadata. Use the existing PUBLISHING_MEDIA binding and PUBLISHING_MEDIA_BASE_URL. Bound raster fetches to 1 MiB each, 5 MiB total, and omit unavailable/oversized media. No video players or live engagement counts. Sanitize remote HTML, preserve content warnings, and fetch only public posts through the existing bounded public transport. The user requested verification with /2026/11/06/c1d5be8d/.

User visual refinement: follow Bluesky's avatar/name/handle layout, white underlined links (user refinement), full-width image and readable timestamp, while keeping the site's existing palette (explicitly no dark card background).

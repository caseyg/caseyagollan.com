# Complete publishing without a CMS

Continue the approved Git/Worker/R2 design; the user requested all remaining implementation except the CMS. Keep research repo downloads ignored and preserve their staged removal. Do not merge or cut over production until implementation and preview verification are complete.

## Independent pieces

- RSS 2.0, Atom, and JSON Feed use the same bundled public-post collection as archives, preserve canonical local-date URLs, include sanitized rendered content and media, and exclude unpublished/deleted records. Add autodiscovery.
- Rich HTML has an explicit `html` format and a maintained parser-based allowlist sanitizer at input and render boundaries. Preserve allowed structure and microformats without interpreting HTML as Markdown. Keep legacy Markdown/plain-text semantics. Reject malformed content objects instead of silently dropping fields.
- Interactions use a private R2-backed durable outbox, with conditional-write leases, bounded retries, and idempotent provider requests. A Worker cron processes jobs. Delivery waits until the canonical source publicly matches the intended content revision; stale jobs are superseded. Deletion/retraction waits for public 404/410. Receiving stays on webmention.io.
- Mastodon and Bluesky adapters are configurable destinations, advertised only when credentials/configuration exist. Persist requested targets and returned syndication URLs; credentials never enter Git. Confirm requested destinations with the user before account-specific setup or external posting. Preview performs no social posts or Webmention sends to real people without explicit test authorization.
- Webmention discovery honors HTTP Link and HTML rel links, uses bounded public-HTTPS fetches, rejects local/private/link-local targets and redirects to them, and retries transient failures durably. Sends only after the intended public revision is visible.

## Publication workflow

The Worker wrapper preserves SvelteKit fetch/assets and adds scheduled outbox work. Dedicated preview/prod state buckets are separate from public media and screenshot storage. Keep canonical content commits and source metadata intact; direct Git changes need the same publication/delivery checks after build. Extend setup/status documentation with honest configured/verified boundaries.

## Confirmed scope

The user selected Mastodon and Bluesky, allowed nonconfidential draft source in GitHub, and excluded private posts. Draft creation requires `draft`; promoting a draft requires `create` plus update authorization. All public readers and delivery exclude drafts. The CMS is excluded. Existing IndieKit credentials are reused through protected input; preview delivery remains disabled during verification.

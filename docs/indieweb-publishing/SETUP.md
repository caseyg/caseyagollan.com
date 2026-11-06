# Publishing setup and verification

Website code starts from `codex/indieweb-publishing`; write tests target `preview/indieweb` in `caseyg/caseyagollan-content`. Keep the canonical submodule pin unchanged for preview testing. Downloaded research repositories are ignored/local-only.

## What is implemented

- Micropub create, source/config queries, mixed edits, delete and restore; optional `If-Match` source ETag prevents overwriting stale edits.
- Literal text and parser-sanitized HTML (`content: [{"html":"..."}]`); allowed markup/microformats survive without interpreting HTML as Markdown.
- Nonconfidential drafts in Git using `post-status: [draft]`; hidden from public pages, feeds and delivery. Private visibility is rejected.
- Public image/video/audio uploads through `/micropub/media`, up to 25 MiB, with type/signature checks; photo/video posts preserve alt text. Uploaded audio can be linked from a note. Deleting a post does not erase uploads.
- RSS `/feed.xml`, Atom `/atom.xml`, JSON Feed `/feed.json`, and feed autodiscovery. Modification timestamps update while local-date permalinks stay fixed.
- Requested Mastodon/Bluesky syndication, durable receipts and returned `syndication` URLs saved back to Git. Current adapters send text plus the canonical link; binary media stays on the source site. Source edits/deletions do not automatically edit/delete independent social copies.
- Outgoing Webmentions, including removed links and deletion/restoration transitions; incoming Webmentions remain on webmention.io.
- Content-pointer sync workflow plus a content-repository notification template. The CMS is excluded.

## Isolated preview resources

Worker: `caseyagollan-publishing-preview`
URL: `https://caseyagollan-publishing-preview.caseygollan.workers.dev`

Bindings:

- `PUBLISHING_MEDIA`: `caseyagollan-publishing-media-preview`, public delivery only through the restricted `/media/...` route.
- `PUBLISHING_STATE`: `caseyagollan-publishing-state-preview`, private jobs, active indices, transition intents, manifest history and provider receipts. No route exposes this bucket.

Both preview buckets and the empty production counterparts (`caseyagollan-publishing-media`, `caseyagollan-publishing-state`) were created November 6, 2026. The screenshot bucket and production Worker have not been changed. Fresh accounts must create those resources once with Wrangler before deployment.

```sh
bun install --frozen-lockfile
bun run build
bun run wrangler deploy --config wrangler.publishing-preview.jsonc --var PUBLISHING_ENABLED:true
```

Preview publishing is enabled on the deployed test Worker, but `PUBLISHING_DELIVERY_ENABLED=false`. It has no cron trigger. This permits reviewing queued requests without sending social posts or Webmentions. CLI `--var` overrides are deployment-specific; the checked-in preview flag defaults to disabled.

## Credentials and provider

The preview Worker now uses its own passkey-based IndieAuth server and native Durable Object token verification (`PUBLISHING_AUTH_MODE=internal`). See [Auth setup and cutover](AUTH.md). Production discovery and publishing now use canonical native endpoints. Tokens issued by IndieKit do not work in internal mode; reconnect clients after cutover.

The preview Worker has these secrets configured:

- `PUBLISHING_GITHUB_TOKEN`: Contents read/write and GraphQL access to the content repository.
- `PUBLISHING_MASTODON_TOKEN`: migrated securely from IndieKit's `MASTODON_ACCESS_TOKEN`.
- `PUBLISHING_BLUESKY_PASSWORD`: migrated securely from IndieKit's `BLUESKY_PASSWORD`.

Mastodon instance is `https://social.coop`; Bluesky service is `https://bsky.social`, identifier `caseyagollan.com`. Existing provider credentials were verified through read-only account/repository calls. No social post was sent. Secret values were passed through protected stdin, never written to source or included in command arguments/output.

For another environment use interactive secret input, always with the intended config:

```sh
bun run wrangler secret put PUBLISHING_GITHUB_TOKEN --config wrangler.publishing-preview.jsonc
bun run wrangler secret put PUBLISHING_MASTODON_TOKEN --config wrangler.publishing-preview.jsonc
bun run wrangler secret put PUBLISHING_BLUESKY_PASSWORD --config wrangler.publishing-preview.jsonc
```

## Token scopes and testing

Obtain an IndieAuth token with `create update delete draft media` for the full test surface. Old tokens do not gain new scopes. Uploads require `media`; draft creation requires `draft`; promotion requires `create`; editing requires `update`; delete and `action=undelete` both use `delete`.

Keep user access tokens outside chat/source. In macOS zsh:

```sh
read -rs 'MICROPUB_TOKEN?Paste IndieAuth access token: '
echo
TEST_ENDPOINT='https://caseyagollan-publishing-preview.caseygollan.workers.dev/micropub'
curl -i -H "Authorization: Bearer $MICROPUB_TOKEN" "$TEST_ENDPOINT?q=config"
```

`q=config` and `q=syndicate-to` advertise only configured destinations. Use their returned `uid` values in a top-level JSON `mp-syndicate-to` array or repeated form `mp-syndicate-to[]`. Requests are stored durably after the Git save. Preview delivery stays off; a saved note is not evidence of a social send.

Create returns 202 and canonical production `Location`; open that path on the test Worker. Read source with `q=source&url=...`; HTML returns an HTML object. Supply the source ETag as `If-Match` on edits to receive 412 for stale revisions. Check the actual Markdown on `preview/indieweb`, then edit, delete, restore and delete the disposable test note. Draft permalinks return 404 while source remains accessible with owner authorization.

For media, POST multipart `file` to `/micropub/media`; expect 201 and a public media `Location`. Use it as a photo/video value. JSON photo objects retain `alt`; Quill's `mp-photo-alt[]` form is supported. Public media supports HEAD, ETag and single byte ranges. HTML/SVG uploads are rejected.

## Durable delivery

`worker.mjs` preserves SvelteKit's fetch handler and adds a scheduled handler. Production config has a five-minute cron, but processing requires persistent `PUBLISHING_ENABLED=true` and `PUBLISHING_DELIVERY_ENABLED=true` settings. Preview never enables delivery during these checks.

A private R2 outbox stores immutable canonical jobs, a separate actionable index, recoverable transition intents, CAS leases, checkpoints and bounded retry state. Terminal history cannot delay active jobs. Micropub commits and manifest recovery share a transition identity; delete/restore still produces new Webmention transitions. First scan seeds old history without broadcasting old links. Explicit syndication requests are retained.

Before sending, the processor checks the latest Git source and the public page's `publishing-revision` marker. Stale work is superseded; an old static page delays delivery until the intended revision is public. Retractions wait for public 404/410. Completed targets and provider receipts survive retries. Permanent Webmention rejections are recorded separately from successful sends.

Mastodon idempotency lasts one hour: after 45 minutes an ambiguous submission stops for manual reconciliation rather than risking a duplicate. Bluesky uses a deterministic valid TID and `putRecord`. Per-source/provider receipts avoid reposting the same source on later edits. Failed canonical jobs and receipts remain in the private bucket for inspection; verify the remote account before retrying an uncertain result.

Untrusted delivery fetches use bounded HTTPS, public hostname/DNS checks, and checked redirects. Do not attach this transport to private/VPC networks. DNS preflight is not IP pinning; the Worker's public egress remains the connection authority.

## Content changes and rebuilds

`.github/workflows/sync-content.yml` runs on `content-updated` dispatch, manual dispatch and a ten-minute catch-up schedule once merged to `main`. It fetches content `main`, validates dates/permalinks, refuses backward/sideways pin moves, stages the exact submodule revision before prebuild, runs tests/check/build, and commits only that pointer. Existing Cloudflare Workers Builds deploys the resulting site revision. Failed checks do not advance production.

For immediate notification, install `workflows/notify-site.yml` from this directory as `.github/workflows/notify-site.yml` in `caseyg/caseyagollan-content`. Its `SITE_CONTENT_SYNC_TOKEN` Actions secret needs Contents write on the site repository for repository dispatch. The site job uses `GITHUB_TOKEN`, or optional `CONTENT_SYNC_TOKEN` if branch policy/integration requires it. No branch protection is bypassed; verify the actual Cloudflare build after the pointer commit.

`/publishing.json` contains only the bundled public snapshot and lets the delivery cron detect direct-Git changes after deployment. A build updates archives and feeds together. Changes awaiting a build remain absent from those static collections.

```sh
bun utils/sync-content.ts --dry-run
```

This checks actual latest content without changing the pin. The notifier template and site workflow are implemented locally; they have not been installed/activated on either repository's main branch.

## Production cutover

1. Review/commit/merge the code and activate the content-sync workflow. Install the content notifier for immediate builds, or initially use scheduled/manual sync.
2. Set production GitHub/Mastodon/Bluesky secrets using the production config. Existing preview credentials do not automatically transfer to production.
3. Persist `PUBLISHING_ENABLED=true` and keep delivery false in `wrangler.jsonc`. Canonical Micropub and IndieAuth discovery are the checked-in build defaults. `PUBLIC_MICROPUB_ENDPOINT` and `PUBLIC_INDIEAUTH_ISSUER` can override them for isolated builds.
4. Build/deploy the production revision, then test Quill/Micropublish, scopes, media, drafts, edits, delete/restore and the ensuing archive/feed update. A manual build must use the same `PUBLIC_MICROPUB_ENDPOINT` value. Temporary CLI overrides alone are insufficient: later automatic builds use the checked-in settings.
5. Persist `PUBLISHING_DELIVERY_ENABLED=true` only when ready for real outgoing Webmentions/social posts, deploy, and verify one explicitly authorized social test plus its returned links. Production remains on content `main`, never `preview/indieweb`.

The preview has live HTML/source/render/edit/delete/restore and R2 read/range verification. Full-size uploads and competing outbox leases passed the real local Cloudflare/R2 runtime. Live preview and production draft/upload checks have passed; live social sends have deliberately not been performed.

## Local checks

```sh
bun test
bun run check
bun run build
bun run wrangler deploy --dry-run
bun utils/check-publishing-media-runtime.ts
```

The manual runtime check needs local sockets but uses no remote bindings or account credentials. `wrangler.sveltekit.jsonc` is adapter-output configuration, never the deployment target; production/preview configs point to the source wrapper and generated static assets.

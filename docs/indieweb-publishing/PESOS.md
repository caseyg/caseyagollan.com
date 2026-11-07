# Social activity imports (PESOS)

The production Worker imports public posts, replies, likes/favourites, and
reposts/boosts from the owner's configured Mastodon and Bluesky accounts into the
canonical Git content repository. It uses the current publishing document format
and saved social snapshots, with no Indiekit dependency.

## Schedule and activation

`PESOS_ENABLED=true` enables importing. The existing five-minute publishing cron
remains in place; `worker.mjs` invokes imports only at UTC minutes divisible by ten
(:00, :10, :20, :30, :40, :50). Set `PESOS_ENABLED=false` and deploy to pause imports.
Deployment of this change activates both ongoing imports and historical backfill.
A branch version upload alone does not activate the cron in production.

The importer reuses these existing bindings:

- `PUBLISHING_GITHUB_*`: the canonical content repository and write credential.
- `PUBLISHING_MASTODON_INSTANCE` and `PUBLISHING_MASTODON_TOKEN`: account lookup,
  public status history, and authenticated favourites. The token needs permission
  to read the authenticated account and its favourites.
- `PUBLISHING_BLUESKY_SERVICE` and `PUBLISHING_BLUESKY_IDENTIFIER`: public account
  repository records. Bluesky import does not require a password or session;
  outbound syndication still uses the existing password configuration.
- `PUBLISHING_STATE`: private R2 leases, checkpoints, cached Git metadata, and
  canonical URL aliases. No new storage resource is required.
- `PUBLISHING_MEDIA` and `PUBLISHING_MEDIA_BASE_URL`: existing image storage for
  saved like/repost snapshots.

GitHub credentials need to read content and create commits on the configured
branch. Imports use one batch commit per run, with at most two new files per
feed so a large historical backfill cannot consume another feed's capacity.
The existing content sync workflow advances the site's submodule and rebuilds
it; importing to Git and seeing it on the public site are separate steps.

## Identity and retries

Every run indexes the latest content repository revision, including existing
site-authored content, rather than using the site's potentially older build.
Immutable Git blob metadata is cached by SHA; source content remains authoritative.

Posts match existing syndication URLs. Likes and reposts match their original
post's URL **and action type**, so liking and reposting one post stay separate.
Bluesky handles resolve to DIDs. Mastodon local federated URLs resolve to their
original canonical URLs. Unavailable alias resolution retries rather than
assuming two URLs identify different posts.

Outbound delivery receipts cover the interval between a successful syndication
and recording its URL in Git. Ambiguous sends pause imports until reconciled.
The Git batch uses `expectedHeadOid` from the indexed revision: concurrent site
publishing makes the batch fail and retry against the new content. R2's conditional
lease prevents overlapping import scans. Checkpoints advance only after the Git
commit succeeds; an ambiguous response or failed checkpoint is recovered by
reindexing Git, including each import's `pesos-source` record ID.

Imports do not set `syndicationTargets` and therefore are not sent back to the
source networks. Likes preserve `like-of`; reposts preserve `repost-of`. Posts
preserve syndication URLs, source text/HTML, reply targets, and supported media
URLs and alt text. Like/repost previews use the same saved snapshot mechanism as
the publishing endpoint. Original post media remains referenced by source URL;
it is not copied into permanent storage by this importer.

## Backfill and archive behavior

Every feed checks its newest page on each run. A durable queue also drains one
older page per feed per run, so historical backfill resumes after interruptions.
Partly processed pages retry on the next run. Source IDs from filtered non-public
pages are tracked too, allowing the scan to reach older public activity.

Only public Mastodon originals are imported, including for likes and boosts.
Private, followers-only, and unlisted posts are excluded. Mastodon favourites do
not expose their action timestamp: `date` records first observation, marked with
`pesos-date-source: [first-observed]`. Other activity uses its supplied action
creation timestamp, formatted in `PUBLISHING_TIMEZONE`.

The archive is additive. Unlikes, undone reposts, and deleted source posts do not
remove imported files. Existing files are not overwritten to reflect remote edits.
Manual deletion without retaining source metadata can allow an item to be imported
again if it has not already been checkpointed. Retain a tombstone when suppressing
an import permanently.

Worker logs include `pesos_scan` counts, `pesos_scan_failed`, and
`pesos_provider_failed` with a feed name. Provider feed failures preserve their
checkpoints and allow other feeds to proceed. A missing/invalid Mastodon token
therefore need not stop Bluesky. Credentials and upstream response bodies are
never logged. `processPesos(env, {dryRun: true})` runs the same planning and identity
checks without committing, advancing checkpoints, or uploading snapshot images;
it can populate private index caches and acquire/release the scan lease.

## Validation

`bun test tests/pesos.test.ts` covers site-origin deduplication, action separation,
federated aliases, delivery receipts, privacy filtering, stable source identity,
local dates, feed pagination, dry runs, checkpoint failure recovery, concurrent
Git changes, and overlapping leases. Run `bun test`, `bun run check`,
`bun run build`, and `bun run wrangler deploy --dry-run` before deployment.

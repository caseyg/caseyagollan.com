# Publishing media, restore, and rebuilds

The existing plan keeps Markdown in Git, media in R2, and publishing in the existing Worker. The user approved dedicated production and preview media buckets, Worker-served public URLs, image/video/audio uploads up to 25 MiB, and restore using `delete` permission.

## Approach

Use an R2 binding instead of browser S3 credentials or a new service. Separate buckets keep preview uploads isolated; do not reuse the screenshot bucket. `/micropub/media` authenticates before reading a multipart `file`, bounds the actual request bytes, restricts media types, stores under a generated immutable key, and returns 201 with Location. `/media/<key>` serves only publishing keys with safe metadata, conditional GET/HEAD, and single byte ranges for video/audio. Uploads are public and are not automatically removed when a post is deleted. No private drafts or arbitrary active documents.

Advertise media only when configured. Accept photo/video post properties and preserve alt text; render using existing post components. Audio files can be uploaded and linked, without introducing a new audio post type. Authenticate uploads with `media` scope; existing tokens lacking it cannot upload. Restore uses `delete`, while action remains `undelete` and preserves the permalink.

For builds, add a site-side workflow to validate a selected content revision, advance the canonical submodule pointer, and push the update to the current site branch. Support repository dispatch from content commits, manual dispatch, and a scheduled catch-up for missed/direct/CMS changes. The production branch is the content repo's `main`; never advance production to `preview/indieweb`. Cloudflare Workers Builds remains responsible for deployment. Include a content-repository workflow template and explicit setup instructions rather than silently editing its main branch or creating credentials.

## Limits and verification

Keep production publishing/discovery unchanged until the user explicitly cuts over. Deploy and test only the isolated preview Worker. Tests cover auth failures, upload limits/type checks, R2 failures, serving/ranges, media serialization, restore authorization, and content revision selection. Run Bun tests, Svelte checks, production build, package dry-run, and live preview tests. Syndication, rich HTML writes, confidential drafts, outgoing Webmentions, and CMS evaluation remain separate work.

# Publishing plan

Keep Markdown in Git, media in R2, and Micropub endpoints in the existing Cloudflare Worker. We don't need D1.

Quill or another Micropub client sends a post to the Worker. It checks the IndieAuth token, commits Markdown through GitHub's API, and returns the post URL. The existing fallback serves new URLs before the next build. Edits, deletions, and archives catch up after deployment. RSS, Atom and JSON Feed are generated from that same bundled snapshot.

## What to build

- `/micropub`: create, update, delete, restore, and query source/configuration. Support standard JSON and form requests.
- `/micropub/media`: authenticated R2 uploads, with credentials kept in the Worker.
- A content-commit workflow that updates the site's submodule pointer and builds that revision. Direct Git and CMS edits use the same workflow.

Use an existing IndieAuth provider initially; its selection and verification need checking. Adapt useful parts of Benji's endpoint rather than importing it unchanged.

## Rules worth keeping

Edit the full document. Preserve unknown metadata, nested properties, alt text, local timestamps, and existing URLs. Define a reversible mapping for plain-text and HTML input.

Check Git revisions before writing. A future editor must also detect edits made since it opened the file.

Filter drafts and deleted content from every public read, including fallback and feeds. Public Git history cannot hold confidential drafts. Reject private visibility until storage and access rules support it.

Keep microformats in rendered HTML. Send Webmentions only after the intended revision is public, with durable retries. Keep receiving through webmention.io for now.

## Build order

1. Test Markdown round trips and Git writes against disposable content.
2. Add authorization and Micropub routes; test with Quill and Micropublish.
3. Add uploads, publication filtering, delete/restore, and the build workflow.
4. Add outgoing interactions. Trial Sveltia before building an editor.

Open choices: IndieAuth provider, content serialization, repository privacy, and build-trigger permissions. Check conflicts, failed builds, timezone boundaries, and actual public output. Follow the repository's test/build checks for code changes.

The disabled-by-default publishing route supports authenticated Git-backed create/edit/delete/restore, source/config queries, source ETags and conditional edits, plain text and sanitized HTML, Git-backed drafts, photo/video posts, and R2 uploads. Private posts remain rejected by design. RSS, Atom and JSON Feed share public-post filtering and modification dates. Native scheduled delivery uses a private R2 outbox with conditional-write leases, retries, transition identities, and source-revision proof before sending Webmentions or requested Mastodon/Bluesky syndication. Public manifests bring direct Git changes into the same delivery path. Receiving remains on webmention.io.

The site-side content-sync workflow and content notifier template are implemented. Production activation and real-client/social-send validation are rollout work; the CMS is explicitly excluded. See [setup and verification](SETUP.md) for configured resources, tested paths, and remaining activation steps.

[CMS notes](GIT-CMS.md) · [Source findings](PROJECTS.md) · [Specs](specs/README.md)

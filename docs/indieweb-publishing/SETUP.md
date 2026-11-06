# Testing the preview

The website code branch is `codex/indieweb-publishing`. Publishing tests write Markdown to `preview/indieweb` in `caseyg/caseyagollan-content`.

## Code preview

Cloudflare automatically builds non-main branches with `bun run build` and `bun run wrangler versions upload`. Open the preview link from the PR's Cloudflare check, or Workers → `caseyagollan` → Builds.

Check `/posts`, `/tag/indieweb`, `/2025/09/07`, and `/2025/09/07/indiekit-progress/`. They should load. `/micropub?q=config` should return 503, "Publishing is not configured", until credentials are connected.

## Publishing test

Standard version previews share the existing Worker's bindings. Use the separate Worker config for write tests:

1. Create `preview/indieweb` from the content repository's current branch on GitHub. Keep the site's submodule pointer unchanged.
2. From this code branch:

```sh
bun run build
bun run wrangler deploy --config wrangler.publishing-preview.jsonc
```

This creates `caseyagollan-publishing-preview` with no production domain route or KV/R2 bindings. Publishing starts disabled.

3. Set its secrets:

```sh
bun run wrangler secret put PUBLISHING_GITHUB_TOKEN --config wrangler.publishing-preview.jsonc
bun run wrangler secret put PUBLISHING_INTROSPECTION_TOKEN --config wrangler.publishing-preview.jsonc
```

Use a Git token with repository Contents read/write permission and GraphQL access. The provider must support authenticated POST introspection, returning boolean `active`, matching `me`, `client_id`, and scopes. That provider connection still needs configuring; legacy verification may need adaptation.

4. Enable only the test Worker, substituting the provider URL:

```sh
bun run wrangler deploy --config wrangler.publishing-preview.jsonc --var PUBLISHING_ENABLED:true --var PUBLISHING_INTROSPECTION_ENDPOINT:https://your-provider.example/introspect
```

5. With an access token for `https://caseyagollan.com/`, POST a uniquely named note to the test Worker's `/micropub`. Check its Markdown on `preview/indieweb`, then query source, edit, delete, and restore. Responses use canonical production URLs: open the returned path on the test Worker to check fallback rendering. Existing static pages still come from the bundled snapshot.

Uploads, rich HTML writes, drafts/private writes, and syndication return explicit errors. Content commits don't rebuild archives or feeds yet.

Quill still discovers IndieKit. Test with direct HTTP requests until preview-specific discovery is configured. Keep the test content branch separate from the normal publishing branch.

# Preview setup

The `/micropub` route is disabled by default. Put these settings in the ignored `.dev.vars` file for local Wrangler, or in an isolated preview Worker's settings:

```dotenv
PUBLISHING_ENABLED=true
PUBLISHING_ME=https://your-preview-identity.example/
PUBLISHING_INTROSPECTION_ENDPOINT=https://your-provider.example/introspect
PUBLISHING_INTROSPECTION_TOKEN=your-provider-server-credential
PUBLISHING_GITHUB_OWNER=your-account
PUBLISHING_GITHUB_REPO=disposable-content-repository
PUBLISHING_GITHUB_BRANCH=preview
PUBLISHING_GITHUB_TOKEN=repository-contents-write-token
PUBLISHING_TIMEZONE=America/New_York
```

The provider must support authenticated POST introspection and return boolean `active`, the matching `me`, `client_id`, and scopes. A legacy token endpoint may need adaptation. The Git token needs Contents read/write permission and GraphQL access.

Run `bun run preview`. Use a token issued for that identity to test JSON/form create, `q=source`, edit, delete, and restore. The missing-post fallback reads the configured repository/branch too. Existing built pages still come from the bundled content snapshot.

Uploads, rich HTML writes, drafts/private writes, and syndication return explicit errors. Build automation is still pending; commits alone don't rebuild archives or feeds.

Discovery still points to IndieKit. Quill's normal sign-in will use that endpoint until we configure discovery on a public preview identity. No production cutover has happened.

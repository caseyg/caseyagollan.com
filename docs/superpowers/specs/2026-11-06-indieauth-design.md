# IndieAuth replacement for IndieKit

The user explicitly approved implementing an in-Worker IndieAuth server so IndieKit can be decommissioned. Keep Git-backed publishing, public R2 media, private delivery state, and incoming webmention.io unchanged. No CMS or private posts.

## Design

Use a dedicated SQLite Durable Object per owner/environment for passkeys, login sessions, pending authorization requests, single-use codes, hashed opaque access tokens, revocation and rate limits. Use maintained SimpleWebAuthn verification instead of implementing authenticator parsing. Passkeys require user verification and exact environment RP/origin matching. Bootstrap registration requires a high-entropy operator secret and closes after the first credential; additional keys require an authenticated owner session. The owner must perform actual passkey enrollment/native security prompts.

Serve authorization/metadata, PKCE S256 code exchange, identity verification, authenticated token introspection, revocation, and owner account/token management. Validate client IDs and redirects, including cross-origin redirect registration via metadata. Consent displays the full client identifier, redirect URI, and granted scopes. Never redirect an invalid request. Owner endpoints require same-origin JSON, HttpOnly Secure SameSite cookies, and per-session CSRF proof. Protocol token/revocation endpoints use explicit credential/code possession, never cookie authorization.

Resource-server verification uses the native DO binding for internal tokens rather than a loopback network request. External introspection requires a separate server credential. Existing IndieKit tokens are not silently accepted by the replacement; clients must reauthorize after discovery cutover.

Preview issuer/RP uses its workers.dev hostname while owner `me` stays https://caseyagollan.com/. Production uses caseyagollan.com. No auth/discovery production cutover or IndieKit shutdown before preview login-to-publishing and revocation validation. Do not log codes, cookies, tokens, bootstrap credentials, or WebAuthn responses. Bootstrap setup tooling passes secrets through protected stdin and offers local clipboard transfer rather than chat.

## Verification

Test code replay/concurrent exchange, PKCE failures, redirect validation, scope/consent tampering, expired/revoked tokens, session/CSRF failures, registration bootstrap closure, WebAuthn challenge binding/counters, and resource-server integration. Run the full Bun suite, Svelte check/build, real workerd/DO integration, packaging checks and preview browser verification using Codex browser only. Live owner credential enrollment requires user action.

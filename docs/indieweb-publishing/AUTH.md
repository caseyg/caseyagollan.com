# Auth setup and cutover

The Worker implements owner passkey sign-in, IndieAuth authorization with explicit consent, S256 PKCE code exchange, opaque expiring access tokens, revocation, and protected introspection. A SQLite Durable Object stores credentials and hashes of secrets. Publishing verifies tokens through the native binding, without an IndieKit dependency. Refresh tokens are not implemented; reconnect after expiry.

## Preview enrollment

The preview Worker has `AUTH_ENABLED=true` and `PUBLISHING_AUTH_MODE=internal`. Production auth is enabled for enrollment; discovery and publishing remain on the legacy path until cutover. Each environment has a separate owner store and passkeys are bound to its exact hostname.

After deploying preview, run on the owner's Mac:

```sh
bun utils/setup-indieauth.ts --preview --copy
```

The script puts bootstrap/introspection secrets into Wrangler through stdin and copies the bootstrap key to the clipboard. Paste it into `/account` and choose **Create first passkey**. Never put it in a URL, chat, or source. Bootstrap closes after enrollment and cannot reset an enrolled account. Add a second passkey for recovery before relying on this service.

At `/account`, create a personal token with `create update delete draft media` for preview publishing tests. Copy it, then dismiss the displayed value. Tokens appear only once; revoke and replace a lost token. Removing a passkey invalidates its sessions; application tokens must be revoked separately. The last passkey cannot be removed.

## Live preview verification — November 6, 2026

The owner enrolled a real passkey through the browser. The deployed server reports at least one credential and bootstrap closed. A copied opaque personal token successfully authorized native Micropub verification, HTML creation/source retrieval, editing, deletion and restoration. A draft returned public 404 and promotion was accepted. Disposable test posts were deleted afterward. A real PNG upload was read back byte-for-byte from R2. Revoking the token immediately changed Micropub config authorization to 401. The copied test token is now revoked; the owner passkey remains enrolled. Outgoing delivery stayed disabled. Canonical-domain enrollment and a real external client's OAuth flow remain production release checks.

## Production release gates

1. Complete live preview passkey enrollment, publishing lifecycle/media checks, and immediate token revocation verification. Protocol and real WebAuthn signature tests also run locally through the native SQLite Durable Object runtime.
2. Provision production publishing secrets and bindings. Enable auth on the canonical domain, deploy, and separately enroll production passkeys with `--production --copy`. Do not copy preview passkeys or owner state.
3. Persist `PUBLISHING_AUTH_MODE=internal`, the publishing enable flag, and build with `PUBLIC_INDIEAUTH_ISSUER=https://caseyagollan.com/` and the production `PUBLIC_MICROPUB_ENDPOINT`. Default build discovery remains IndieKit until deliberately changed.
4. Verify homepage discovery, metadata, a real client's authorization/consent/PKCE exchange, production publishing, media delivery, and revocation. Existing IndieKit tokens must be replaced. Keep outgoing delivery disabled until its separate send checks are authorized.
5. Activate content sync and verify the resulting public build. Audit old IndieKit media URLs, scheduled jobs, integrations, and incoming Webmention configuration before shutting down Railway. Copy any still-needed hosted media and preserve working public URLs.

Do not decommission IndieKit merely because the new Worker deploys. Retain it until canonical-domain passkey sign-in and client migration are verified, and remaining hosted dependencies are removed. A rollback to external mode restores the legacy provider only while that provider is still running; tokens are not interchangeable.

## Production rollout in progress — November 6, 2026

Worker version `2cfcda81-f44b-4634-918c-0398e1790f01` enabled canonical-domain auth. `/auth/session` and OAuth metadata returned 200; discovery still advertised IndieKit. Production bootstrap secrets were provisioned without exposing values. Owner enrollment is pending. Publishing and outgoing delivery remain disabled.

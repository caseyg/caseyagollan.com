<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import MastodonSettings, { type MastodonState } from './MastodonSettings.svelte';

	const hour = 3_600_000;
	const now = Date.UTC(2026, 10, 26, 15);
	const later = <T,>(value: T) => () => new Promise<T>((resolve) => setTimeout(() => resolve(value), 500));
	const connected: MastodonState = { configured: true, connection: { connected: true, instance: 'social.coop', account: 'caseyg@social.coop', accountUrl: 'https://social.coop/@caseyg', connectedAt: now - 48 * hour, lastPostAt: now - 2 * hour, tokenFallback: true } };
	const notConnected: MastodonState = { configured: true, connection: { connected: false, instance: 'social.coop', tokenFallback: true } };

	const { Story } = defineMeta({ title: 'Site/MastodonSettings', component: MastodonSettings, parameters: { docs: { story: { height: '320px' } } } });
</script>

<!-- On /account, for the signed-in owner: Mastodon posting uses the pasted access token until OAuth is connected. -->
<Story name="Not connected" args={{ load: later(notConnected), connect: later({ error: 'Stories don’t open Mastodon.' }) }} />

<Story name="Connected" args={{ load: later(connected), disconnect: later(notConnected) }} />

<!-- Back from the server's sign-in page. -->
<Story name="Just connected" args={{ result: 'connected', load: later({ ...connected, connection: { ...connected.connection!, lastPostAt: undefined } }) }} />

<!-- A send fell back to the access token; the reason shows so OAuth can be checked. -->
<Story name="Fell back to access token" args={{ load: later({ ...connected, connection: { ...connected.connection!, fallback: { at: now - hour, reason: 'Mastodon refused the OAuth token (HTTP 403)' } } }) }} />

<!-- The app was revoked on the server: reconnect. -->
<Story name="Needs reconnecting" args={{ load: later({ ...connected, connection: { ...connected.connection!, connected: false, broken: { at: now - hour, reason: 'Mastodon refused the OAuth token (HTTP 401)' } } }) }} />

<Story name="Sign-in failed" args={{ result: 'error', message: 'Mastodon access was not allowed.', load: later(notConnected) }} />

<Story name="No fallback" args={{ load: later({ configured: true, connection: { connected: false, instance: 'social.coop', tokenFallback: false } }) }} />

<Story name="Not set up" args={{ load: later({ configured: false }) }} />

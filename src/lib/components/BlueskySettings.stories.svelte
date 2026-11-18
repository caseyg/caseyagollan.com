<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import BlueskySettings, { type BlueskyState } from './BlueskySettings.svelte';

	const hour = 3_600_000;
	const now = Date.UTC(2026, 10, 18, 15);
	const later = <T,>(value: T) => () => new Promise<T>((resolve) => setTimeout(() => resolve(value), 500));
	const connected: BlueskyState = { configured: true, connection: { connected: true, handle: 'caseyagollan.com', did: 'did:plc:abcdefghijklmnopqrstuvwx', connectedAt: now - 48 * hour, lastPostAt: now - 2 * hour, passwordFallback: true } };
	const notConnected: BlueskyState = { configured: true, connection: { connected: false, passwordFallback: true } };

	const { Story } = defineMeta({ title: 'Site/BlueskySettings', component: BlueskySettings, parameters: { docs: { story: { height: '320px' } } } });
</script>

<!-- On /account, for the signed-in owner: Bluesky posting signs in with the app password until OAuth is connected. -->
<Story name="Not connected" args={{ load: later(notConnected), connect: later({ error: 'Stories don’t open Bluesky.' }) }} />

<Story name="Connected" args={{ load: later(connected), disconnect: later(notConnected) }} />

<!-- Back from Bluesky's sign-in page. -->
<Story name="Just connected" args={{ result: 'connected', load: later({ ...connected, connection: { ...connected.connection!, lastPostAt: undefined } }) }} />

<!-- A send fell back to the app password; the reason shows so OAuth can be checked. -->
<Story name="Fell back to app password" args={{ load: later({ ...connected, connection: { ...connected.connection!, fallback: { at: now - hour, reason: 'Bluesky refused the OAuth token (HTTP 403)' } } }) }} />

<!-- The authorization server refused a refresh (revoked or expired): reconnect. -->
<Story name="Needs reconnecting" args={{ load: later({ ...connected, connection: { ...connected.connection!, connected: false, broken: { at: now - hour, reason: 'Bluesky refused the token request (invalid_grant)' } } }) }} />

<Story name="Sign-in failed" args={{ result: 'error', message: 'Bluesky access was not allowed.', load: later(notConnected) }} />

<Story name="No fallback" args={{ load: later({ configured: true, connection: { connected: false, passwordFallback: false } }) }} />

<Story name="Not set up" args={{ load: later({ configured: false }) }} />

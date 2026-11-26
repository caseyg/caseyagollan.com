<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import OAuthConnection, { type OAuthConnectionView } from './OAuthConnection.svelte';

	const now = Date.UTC(2026, 10, 26, 15);
	const later = <T,>(value: T) => () => new Promise<T>((resolve) => setTimeout(() => resolve(value), 500));
	const view = (state: unknown) => state as OAuthConnectionView;
	const args = { id: 'example', title: 'Example', endpoint: '/api/example/oauth', view, fallbackName: 'access token', intro: 'Connect once with OAuth so posts don’t depend on a pasted access token.' };

	const { Story } = defineMeta({ title: 'Site/Account/OAuthConnection', component: OAuthConnection, parameters: { docs: { story: { height: '320px' } } } });
</script>

<!-- The shared settings block behind Bluesky and Mastodon: one service, connected with OAuth, with an older credential to fall back on. -->
<Story name="Not connected" args={{ ...args, load: later({ configured: true, connected: false, hasFallback: true }), connect: later({ error: 'Stories don’t open a sign-in page.' }) }} />

<Story name="Connected" args={{ ...args, load: later({ configured: true, connected: true, account: 'casey@example.social', accountUrl: 'https://example.social/@casey', connectedAt: now - 86_400_000, hasFallback: false }), disconnect: later({ configured: true, connected: false, hasFallback: false }) }} />

<Story name="Could not be read" args={{ ...args, load: later({ configured: true, error: 'Example couldn’t be reached. Try again in a moment.' }) }} />

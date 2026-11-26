<script module lang="ts">
	export interface BlueskyConnectionState {
		connected: boolean;
		handle?: string;
		did?: string;
		scope?: string;
		connectedAt?: number;
		lastPostAt?: number;
		fallback?: { at: number; reason: string };
		broken?: { at: number; reason: string };
		passwordFallback: boolean;
	}
	export interface BlueskyState {
		configured: boolean;
		connection?: BlueskyConnectionState;
		error?: string;
	}
</script>

<script lang="ts">
	import OAuthConnection, { type OAuthConnectionView } from './account/OAuthConnection.svelte';

	interface Props {
		/** The owner's CSRF token, sent with each change. */
		csrf?: string;
		/** What the sign-in callback reported: `connected`, or `error` with a message. */
		result?: string | null;
		message?: string | null;
		/** Stand-ins for the requests, for stories. */
		load?: () => Promise<BlueskyState>;
		connect?: () => Promise<{ redirect?: string; error?: string }>;
		disconnect?: () => Promise<BlueskyState>;
	}

	let { csrf, result, message, load, connect, disconnect }: Props = $props();

	const view = ({ configured, connection, error }: BlueskyState): OAuthConnectionView => ({
		configured,
		...(error ? { error } : {}),
		...(connection
			? {
					connected: connection.connected,
					account: connection.handle,
					accountUrl: connection.handle ? `https://bsky.app/profile/${connection.handle}` : undefined,
					connectedAt: connection.connectedAt,
					lastPostAt: connection.lastPostAt,
					fallback: connection.fallback,
					broken: connection.broken,
					hasFallback: connection.passwordFallback
				}
			: {})
	});
</script>

<!-- How syndication signs in to Bluesky: OAuth once connected, the app password as the fallback. -->
<OAuthConnection
	id="bluesky"
	title="Bluesky"
	endpoint="/api/bluesky/oauth"
	{view}
	fallbackName="app password"
	intro="Connect once with OAuth so posts don’t depend on an app password. Bluesky asks you to approve posting and photo uploads only."
	{csrf}
	{result}
	{message}
	{load}
	{connect}
	{disconnect}
/>

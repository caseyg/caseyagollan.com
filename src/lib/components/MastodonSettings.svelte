<script module lang="ts">
	export interface MastodonConnectionState {
		connected: boolean;
		/** The instance's host, such as social.coop. */
		instance: string;
		/** The connected account, as user@host. */
		account?: string;
		accountUrl?: string;
		scope?: string;
		connectedAt?: number;
		lastPostAt?: number;
		fallback?: { at: number; reason: string };
		broken?: { at: number; reason: string };
		tokenFallback: boolean;
	}
	export interface MastodonState {
		configured: boolean;
		connection?: MastodonConnectionState;
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
		load?: () => Promise<MastodonState>;
		connect?: () => Promise<{ redirect?: string; error?: string }>;
		disconnect?: () => Promise<MastodonState>;
	}

	let { csrf, result, message, load, connect, disconnect }: Props = $props();

	const view = ({ configured, connection, error }: MastodonState): OAuthConnectionView => ({
		configured,
		...(error ? { error } : {}),
		...(connection
			? {
					connected: connection.connected,
					account: connection.account,
					accountUrl: connection.accountUrl,
					connectedAt: connection.connectedAt,
					lastPostAt: connection.lastPostAt,
					fallback: connection.fallback,
					broken: connection.broken,
					hasFallback: connection.tokenFallback
				}
			: {})
	});
</script>

<!-- How syndication signs in to Mastodon: OAuth once connected, the pasted access token as the fallback. -->
<OAuthConnection
	id="mastodon"
	title="Mastodon"
	endpoint="/api/mastodon/oauth"
	{view}
	fallbackName="access token"
	intro="Connect once with OAuth so posts don’t depend on a pasted access token. Your server asks you to approve posting, photo uploads, and reading your own posts and favourites for the importer."
	{csrf}
	{result}
	{message}
	{load}
	{connect}
	{disconnect}
/>

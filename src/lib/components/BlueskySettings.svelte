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
	import { onMount } from 'svelte';
	import { Button, Notice, Section } from '$lib/components/ui';

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

	const ENDPOINT = '/api/bluesky/oauth';
	let info = $state<BlueskyState | null>(null);
	let busy = $state(false);
	let notice = $state('');

	async function request<T>(action?: 'connect' | 'disconnect'): Promise<T> {
		const response = await fetch(ENDPOINT, {
			method: action ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
			headers: action ? { 'content-type': 'application/json', 'x-csrf-token': csrf ?? '' } : {},
			body: action ? JSON.stringify({ action }) : undefined
		});
		const body = (await response.json().catch(() => ({}))) as T & { error?: string };
		return response.ok ? body : ({ ...body, error: body.error ?? 'Bluesky couldn’t be reached. Try again in a moment.' } as T);
	}

	onMount(async () => {
		info = await (load ? load() : request<BlueskyState>());
	});

	async function onConnect() {
		busy = true;
		notice = '';
		const next = await (connect ? connect() : request<{ redirect?: string; error?: string }>('connect'));
		if (next.redirect) window.location.assign(next.redirect);
		else {
			busy = false;
			notice = next.error ?? 'Bluesky couldn’t start the sign-in.';
		}
	}

	async function onDisconnect() {
		busy = true;
		notice = '';
		const next = await (disconnect ? disconnect() : request<BlueskyState>('disconnect'));
		busy = false;
		if (next.error) notice = next.error;
		else {
			info = next;
			notice = 'Disconnected. Bluesky posts use the app password until you connect again.';
		}
	}

	const date = (value: number) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
	const connection = $derived(info?.connection);
</script>

<!-- How syndication signs in to Bluesky: OAuth once connected, the app password as the fallback. -->
<div id="bluesky">
	<Section title="Bluesky">
		{#if result === 'connected'}<Notice>Bluesky is connected. New posts go out with OAuth.</Notice>{/if}
		{#if result === 'error'}<Notice tone="error">{message || 'Bluesky could not be connected.'}</Notice>{/if}
		{#if !info}
			<p class="hint">Checking Bluesky…</p>
		{:else if info.error && !info.connection}
			<Notice tone="error">{info.error}</Notice>
		{:else if !info.configured}
			<Notice>Bluesky OAuth needs publishing and the <code>PUBLISHING_STATE</code> bucket, on the site’s own address.</Notice>
		{:else if connection?.broken}
			<Notice tone="error">Bluesky stopped accepting this connection: {connection.broken.reason}. Connect again to keep posting with OAuth.</Notice>
			{#if connection.passwordFallback}<p class="hint">Until then, posts use the app password.</p>{/if}
			<div class="actions">
				<Button variant="primary" disabled={busy} onclick={onConnect}>{busy ? 'Opening Bluesky…' : 'Reconnect Bluesky'}</Button>
				<Button variant="quiet" disabled={busy} onclick={onDisconnect}>Disconnect</Button>
			</div>
		{:else if connection?.connected}
			<p>Posts go to <a href={`https://bsky.app/profile/${connection.handle}`}>@{connection.handle}</a> with OAuth.</p>
			<dl class="details">
				{#if connection.connectedAt}<dt>Connected</dt><dd>{date(connection.connectedAt)}</dd>{/if}
				<dt>Last OAuth post</dt><dd>{connection.lastPostAt ? date(connection.lastPostAt) : 'None yet'}</dd>
				{#if connection.fallback}<dt>Last app-password fallback</dt><dd>{date(connection.fallback.at)} · {connection.fallback.reason}</dd>{/if}
				<dt>Fallback</dt><dd>{connection.passwordFallback ? 'App password, if OAuth fails' : 'None'}</dd>
			</dl>
			<div class="actions">
				<Button disabled={busy} onclick={onConnect}>{busy ? 'Opening Bluesky…' : 'Reconnect'}</Button>
				<Button variant="quiet" disabled={busy} onclick={onDisconnect}>Disconnect</Button>
			</div>
		{:else}
			<p>Connect once with OAuth so posts don’t depend on an app password. Bluesky asks you to approve posting and photo uploads only.</p>
			{#if connection?.passwordFallback}<p class="hint">Until you connect, posts use the app password.</p>{/if}
			<div class="actions">
				<Button variant="primary" disabled={busy} onclick={onConnect}>{busy ? 'Opening Bluesky…' : 'Connect Bluesky'}</Button>
			</div>
		{/if}
		<p class="status" role="status" aria-live="polite">{notice}</p>
	</Section>
</div>

<style>
	.details {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: var(--space-1) var(--space-4);
		margin: var(--space-3) 0;
		font-size: var(--fs-sm);
	}

	dt {
		color: var(--text-muted);
	}

	dd {
		margin: 0;
		overflow-wrap: anywhere;
	}

	a {
		color: inherit;
		text-decoration-thickness: from-font;
		text-underline-offset: var(--underline-offset);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.hint,
	.status {
		color: var(--text-muted);
		font-size: var(--fs-sm);
	}

	.status:empty {
		display: none;
	}
</style>

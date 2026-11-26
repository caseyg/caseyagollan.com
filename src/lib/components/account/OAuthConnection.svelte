<script module lang="ts">
	/** How one posting service is connected, as the settings draw it. Never holds tokens. */
	export interface OAuthConnectionView {
		/** False when the site can't offer OAuth for this service here. */
		configured: boolean;
		/** Why the state couldn't be read. */
		error?: string;
		connected?: boolean;
		/** The connected account, as shown after an @. */
		account?: string;
		accountUrl?: string;
		connectedAt?: number;
		/** The last post sent with OAuth. */
		lastPostAt?: number;
		/** The last time a send used the fallback instead, and why. */
		fallback?: { at: number; reason: string };
		/** Set when the service refused the connection and it needs making again. */
		broken?: { at: number; reason: string };
		/** Whether posts can still go out without OAuth. */
		hasFallback?: boolean;
	}
</script>

<script lang="ts" generics="T">
	import { onMount } from 'svelte';
	import { Button, Notice, Section } from '$lib/components/ui';

	interface Props {
		/** The anchor sign-in callbacks land on, such as `bluesky`. */
		id: string;
		/** The service's name, such as Bluesky. */
		title: string;
		/** Answers GET with the state, and POST `{ action }` to connect or disconnect. */
		endpoint: string;
		/** Turns the endpoint's answer into what is drawn. */
		view: (state: T) => OAuthConnectionView;
		/** What posts use without OAuth, such as "app password". */
		fallbackName: string;
		/** The case for connecting, shown before the Connect button. */
		intro: string;
		/** The owner's CSRF token, sent with each change. */
		csrf?: string;
		/** What the sign-in callback reported: `connected`, or `error` with a message. */
		result?: string | null;
		message?: string | null;
		/** Stand-ins for the requests, for stories. */
		load?: () => Promise<T>;
		connect?: () => Promise<{ redirect?: string; error?: string }>;
		disconnect?: () => Promise<T>;
	}

	let { id, title, endpoint, view, fallbackName, intro, csrf, result, message, load, connect, disconnect }: Props = $props();

	let raw = $state<T | null>(null);
	let busy = $state(false);
	let notice = $state('');

	async function request<R>(action?: 'connect' | 'disconnect'): Promise<R> {
		const response = await fetch(endpoint, {
			method: action ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
			headers: action ? { 'content-type': 'application/json', 'x-csrf-token': csrf ?? '' } : {},
			body: action ? JSON.stringify({ action }) : undefined
		});
		const body = (await response.json().catch(() => ({}))) as R & { error?: string };
		return response.ok ? body : ({ ...body, error: body.error ?? `${title} couldn’t be reached. Try again in a moment.` } as R);
	}

	onMount(async () => {
		raw = await (load ? load() : request<T>());
	});

	async function onConnect() {
		busy = true;
		notice = '';
		const next = await (connect ? connect() : request<{ redirect?: string; error?: string }>('connect'));
		if (next.redirect) window.location.assign(next.redirect);
		else {
			busy = false;
			notice = next.error ?? `${title} couldn’t start the sign-in.`;
		}
	}

	async function onDisconnect() {
		busy = true;
		notice = '';
		const next = await (disconnect ? disconnect() : request<T>('disconnect'));
		busy = false;
		const error = view(next).error;
		if (error) notice = error;
		else {
			raw = next;
			notice = view(next).hasFallback ? `Disconnected. ${title} posts use the ${fallbackName} until you connect again.` : `Disconnected. ${title} posts wait until you connect again.`;
		}
	}

	const date = (value: number) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
	const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
	const info = $derived(raw ? view(raw) : null);
</script>

<!-- How syndication signs in to one service: OAuth once connected, with an older credential as the fallback. -->
<div {id}>
	<Section {title}>
		{#if result === 'connected'}<Notice>{title} is connected. New posts go out with OAuth.</Notice>{/if}
		{#if result === 'error'}<Notice tone="error">{message || `${title} could not be connected.`}</Notice>{/if}
		{#if !info}
			<p class="hint">Checking {title}…</p>
		{:else if info.error && info.connected === undefined}
			<Notice tone="error">{info.error}</Notice>
		{:else if !info.configured}
			<Notice>{title} OAuth needs publishing and the <code>PUBLISHING_STATE</code> bucket, on the site’s own address.</Notice>
		{:else if info.broken}
			<Notice tone="error">{title} stopped accepting this connection: {info.broken.reason}. Connect again to keep posting with OAuth.</Notice>
			{#if info.hasFallback}<p class="hint">Until then, posts use the {fallbackName}.</p>{/if}
			<div class="actions">
				<Button variant="primary" disabled={busy} onclick={onConnect}>{busy ? `Opening ${title}…` : `Reconnect ${title}`}</Button>
				<Button variant="quiet" disabled={busy} onclick={onDisconnect}>Disconnect</Button>
			</div>
		{:else if info.connected}
			<p>Posts go to {#if info.accountUrl}<a href={info.accountUrl}>@{info.account}</a>{:else}@{info.account}{/if} with OAuth.</p>
			<dl class="details">
				{#if info.connectedAt}<dt>Connected</dt><dd>{date(info.connectedAt)}</dd>{/if}
				<dt>Last OAuth post</dt><dd>{info.lastPostAt ? date(info.lastPostAt) : 'None yet'}</dd>
				{#if info.fallback}<dt>Last {fallbackName} fallback</dt><dd>{date(info.fallback.at)} · {info.fallback.reason}</dd>{/if}
				<dt>Fallback</dt><dd>{info.hasFallback ? `${capital(fallbackName)}, if OAuth fails` : 'None'}</dd>
			</dl>
			<div class="actions">
				<Button disabled={busy} onclick={onConnect}>{busy ? `Opening ${title}…` : 'Reconnect'}</Button>
				<Button variant="quiet" disabled={busy} onclick={onDisconnect}>Disconnect</Button>
			</div>
		{:else}
			<p>{intro}</p>
			{#if info.hasFallback}<p class="hint">Until you connect, posts use the {fallbackName}.</p>{/if}
			<div class="actions">
				<Button variant="primary" disabled={busy} onclick={onConnect}>{busy ? `Opening ${title}…` : `Connect ${title}`}</Button>
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

<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import type { AuthOperations } from '$lib/server/indieauth/contracts';
	import { replaceState } from '$app/navigation';
	import { Button, Heading, Notice, Page, PageHeader, Row, RowList, Section, Tabs, type TabItem } from '$lib/components/ui';
	import { startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser';
	import type { PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/browser';
	import { issuerName, passkeyError, previewSignInHref, safeReturnTo, signInWithPasskey } from '$lib/passkey-login';
	import { rememberOwner } from '$lib/owner';
	import NewsletterSettings from '$lib/components/NewsletterSettings.svelte';
	import BlueskySettings from '$lib/components/BlueskySettings.svelte';
	import AccountSignIn from '$lib/components/account/AccountSignIn.svelte';
	import ConsentRequest from '$lib/components/account/ConsentRequest.svelte';
	import Passkeys from '$lib/components/account/Passkeys.svelte';
	import AccessTokens from '$lib/components/account/AccessTokens.svelte';
	import { accountDate } from '$lib/components/account/scopes';

	/** `signInWith` is set on branch previews, which sign in through that site instead of a passkey. */
	type Session = { authenticated: boolean; csrf?: string; expiresAt?: number; credentialCount: number; setupAvailable: boolean; signInWith?: string };
	type Request = { clientId: string; redirectUri: string; scope: string[] };
	type Token = AuthOperations['listTokens']['output'][number];
	type Credential = { id: string; createdAt: number; deviceType?: string; backedUp?: boolean };

	/** The settings groups. Add a connection to `connections`, not a new group. */
	const SECTIONS: TabItem[] = [
		{ value: 'tools', label: 'Tools' },
		{ value: 'connections', label: 'Connections' },
		{ value: 'newsletter', label: 'Newsletter' },
		{ value: 'security', label: 'Security' }
	];
	/** Addresses inside a group that open it: where sign-in callbacks and old links land. */
	const ANCHORS: Record<string, string> = { bluesky: 'connections', 'connections-chat': 'connections', passkeys: 'security', tokens: 'security' };
	function sectionFor(url: URL): string | undefined {
		const anchor = url.hash.slice(1);
		if (SECTIONS.some((section) => section.value === anchor)) return anchor;
		if (ANCHORS[anchor]) return ANCHORS[anchor];
		if (url.searchParams.has('bluesky') || url.searchParams.has('mcp')) return 'connections';
	}
	let section = $state('tools');
	let session = $state<Session | null>(null);
	let request = $state<Request | null>(null);
	let selectedScopes = $state<string[]>([]);
	let tokens = $state<Token[]>([]);
	let credentials = $state<Credential[]>([]);
	let newToken = $state('');
	let busy = $state(false);
	let error = $state('');
	let notice = $state('');
	let ready = $state(false);
	let passkeysSupported = $state(false);
	let loadedRequestId = $state<string | null>(null);
	let requestError = $state('');
	const requestId = $derived(page.url.searchParams.get('request'));
	const previewFailed = $derived(page.url.searchParams.get('signin') === 'failed');
	const previewReturn = $derived(safeReturnTo(page.url.searchParams.get('returnTo'), page.url.origin) ?? '/account');
	function returnToPage() {
		const target = safeReturnTo(page.url.searchParams.get('returnTo'), page.url.origin);
		if (!target || requestId) return false;
		window.location.replace(target);
		return true;
	}

	async function api<T>(path: string, body?: unknown): Promise<T> {
		const response = await fetch(path, {
			method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
			headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
			body: body === undefined ? undefined : JSON.stringify(body)
		});
		if (!response.ok) {
			if (path.startsWith('/auth/request?') && [400, 404, 410].includes(response.status)) throw new Error('This app connection request has expired or is invalid. Return to the app and start again.');
			if (response.status === 401) throw new Error('Your sign-in has expired. Sign in again to continue.');
			if (response.status === 429) throw new Error('Too many attempts. Please wait before trying again.');
			if (response.status === 503) throw new Error('Account access is temporarily unavailable. Please try again later.');
			throw new Error('This request could not be completed. Refresh the page and try again.');
		}
		return response.json();
	}
	async function refresh() {
		session = await api<Session>('/auth/session');
		// Edit links on static pages follow the real session, so an expired one hides them too.
		rememberOwner(session.authenticated);
		if (session.authenticated) {
			if (returnToPage()) return;
			[tokens, credentials] = await Promise.all([api<Token[]>('/auth/tokens'), api<Credential[]>('/auth/credentials')]);
			if (requestId) {
				requestError = '';
				try {
					const pending = await api<Request | null>(`/auth/request?id=${encodeURIComponent(requestId)}`);
					if (!pending) throw new Error('This app connection request has expired or is invalid. Return to the app and start again.');
					request = pending;
					if (loadedRequestId !== requestId) {
						selectedScopes = [...pending.scope];
						loadedRequestId = requestId;
					}
				} catch (cause) {
					request = null;
					requestError = cause instanceof Error ? cause.message : 'The app connection request could not be loaded. Return to the app and start again.';
				}
			}
		} else { tokens = []; credentials = []; newToken = ''; request = null; }
	}
	async function run(action: () => Promise<void>) {
		if (busy) return;
		busy = true; error = ''; notice = '';
		try { await action(); }
		catch (cause) {
			error = passkeyError(cause);
		} finally { busy = false; }
	}
	onMount(() => {
		passkeysSupported = browserSupportsWebAuthn();
		section = sectionFor(new URL(window.location.href)) ?? section;
		void run(async () => {
			try { await refresh(); } finally { ready = true; }
		});
	});
	async function login() {
		await run(async () => {
			await signInWithPasskey();
			if (returnToPage()) return;
			await refresh(); notice = 'You are signed in.';
		});
	}
	async function register(setupToken = '') {
		await run(async () => {
			const authorization = session?.authenticated ? { csrf: session.csrf } : { setupToken };
			{
				const challenge = await api<{ id: string; options: PublicKeyCredentialCreationOptionsJSON }>('/auth/passkey/register/options', authorization);
				const response = await startRegistration({ optionsJSON: challenge.options });
				await api('/auth/passkey/register/verify', { id: challenge.id, response, ...authorization });
				await refresh(); notice = 'Passkey added.';
			}
		});
	}
	async function consent() {
		await run(async () => {
			const result = await api<{ redirect: string }>('/auth/consent', { id: requestId, scope: selectedScopes, csrf: session?.csrf });
			window.location.assign(result.redirect);
		});
	}
	async function createToken(name: string, scope: string[]) {
		await run(async () => {
			newToken = '';
			const result = await api<{ access_token: string }>('/auth/tokens', { scope, name, csrf: session?.csrf });
			newToken = result.access_token;
			await refresh();
		});
	}
	const revokeToken = (id: string) => run(async () => { await api('/auth/tokens/revoke', { id, csrf: session?.csrf }); newToken = ''; await refresh(); notice = 'Access revoked.'; });
	const removePasskey = (id: string) => run(async () => { await api('/auth/credentials/remove', { id, csrf: session?.csrf }); await refresh(); notice = 'Passkey removed.'; });
	const copyToken = () => run(async () => { await navigator.clipboard.writeText(newToken); notice = 'Token copied.'; });
	const signOut = () => run(async () => { await api('/auth/logout', { csrf: session?.csrf }); rememberOwner(false); newToken = ''; await refresh(); notice = 'You are signed out.'; });

	// The open group is part of the address, so it can be linked to and survives a reload.
	function openSection(value: string) {
		section = value;
		const url = new URL(page.url);
		url.hash = value;
		replaceState(url, page.state);
	}
	function onhashchange() {
		section = sectionFor(new URL(window.location.href)) ?? section;
	}
	const signedOut = $derived(!!session && !session.authenticated);
	/** An app's request, or a sign-in, is one decision: it gets the page to itself. */
	const focused = $derived(!!requestId || signedOut);
</script>

<svelte:head><title>Account · Casey Gollan</title><meta name="robots" content="noindex, nofollow" /></svelte:head>
<svelte:window {onhashchange} />

<Page as="main" width={focused ? 'reading' : 'wide'} aria-busy={busy}>
	<PageHeader trail={[{ label: 'Casey Gollan', href: '/', icon: '👋' }]} title={focused ? 'Account' : undefined} tight>
		{#if !focused}<Heading level={1} size="display">Account</Heading>{/if}
	</PageHeader>
	{#if error}<Notice tone="error">{error}</Notice>{/if}
	<p class="status" role="status" aria-live="polite">{busy && ready ? 'Please wait…' : notice}</p>
	{#if !ready && !error}<p class="status">Loading account…</p>{/if}
	{#if previewFailed && signedOut}<Notice tone="error">Sign-in could not be completed. Please try again.</Notice>{/if}
	{#if session && signedOut}
		<AccountSignIn
			signInWith={session.signInWith}
			returnTo={previewReturn}
			hasPasskey={session.credentialCount > 0}
			setupAvailable={session.setupAvailable}
			{passkeysSupported}
			{busy}
			reason={requestId ? 'An app is asking for access. Sign in to review its request.' : undefined}
			onlogin={login}
			onsetup={register}
		/>
	{:else if requestId && ready}
		{#if request}
			<ConsentRequest clientId={request.clientId} redirectUri={request.redirectUri} scope={request.scope} bind:selected={selectedScopes} {busy} onallow={consent} />
		{:else if requestError}
			<Notice tone="error">{requestError}</Notice>
			<Button href="/account">Go to your account</Button>
		{/if}
	{:else if session?.authenticated}
		{@const owner = session}
		<Tabs tabs={SECTIONS} label="Account settings" bind:value={() => section, openSection}>
			{#snippet panel(value)}
				{#if value === 'tools'}
					<Section title="Tools">
						<RowList label="Tools">
							<Row href="/new/" title="Write a new post" detail="Notes, articles, photos, replies and the rest." />
							<Row href="/readwise" title="Review Readwise bookmarks" detail="Choose which saved links become bookmark posts." />
							<Row href="/chat" title="Chat" detail="Ask about the site, or have it draft and publish." />
							<Row href="/tables/" title="Tables" detail="Canvases of posts, links and saves." />
						</RowList>
					</Section>
				{:else if value === 'connections'}
					<BlueskySettings csrf={owner.csrf} result={page.url.searchParams.get('bluesky')} message={page.url.searchParams.get('message')} />
				{:else if value === 'newsletter'}
					<NewsletterSettings csrf={owner.csrf} />
				{:else if value === 'security'}
					{#if owner.signInWith}
						<Section title="Passkeys and tokens">
							<p>Signed in to this preview through {issuerName(owner.signInWith)}. Passkeys and access tokens are managed there.</p>
							<Button href={new URL('/account#security', owner.signInWith).href}>Open {issuerName(owner.signInWith)}</Button>
						</Section>
					{:else}
						<Passkeys {credentials} {busy} {passkeysSupported} onadd={() => register()} onremove={removePasskey} />
						<AccessTokens {tokens} {newToken} {busy} oncreate={createToken} onrevoke={revokeToken} oncopy={copyToken} ondismiss={() => { newToken = ''; }} />
					{/if}
					<Section title="This session">
						<RowList label="This session">
							<Row title="Signed in on this browser" detail={owner.expiresAt ? `Until ${accountDate(owner.expiresAt)}` : undefined}>
								{#snippet action()}<Button size="sm" disabled={busy} onclick={signOut}>Sign out</Button>{/snippet}
							</Row>
						</RowList>
					</Section>
				{/if}
			{/snippet}
		</Tabs>
	{/if}
</Page>

<style>
	.status { min-height: 1.5em; margin: var(--space-2) 0; color: var(--text-secondary); font-size: var(--fs-sm); }
	.status:empty { display: none; }
</style>

<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { Button, Checkbox, Heading, Notice, Page, PageHeader, Section, TextField } from '$lib/components/ui';
	import { startRegistration, startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser';
	import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';

	type Session = { authenticated: boolean; csrf?: string; expiresAt?: number; credentialCount: number; setupAvailable: boolean };
	type Request = { clientId: string; redirectUri: string; scope: string[] };
	type Token = { id: string; clientId: string; scope: string; createdAt: number; expiresAt: number };
	type Credential = { id: string; createdAt: number; deviceType?: string; backedUp?: boolean };
	const scopes: Record<string, string> = {
		profile: 'Read your public profile.', read: 'Read content available to this account.',
		create: 'Create posts.', update: 'Edit existing posts.', delete: 'Delete posts.',
		draft: 'Work with drafts.', media: 'Upload images and other media.'
	};
	let session = $state<Session | null>(null);
	let request = $state<Request | null>(null);
	let selectedScopes = $state<string[]>([]);
	let personalScopes = $state<string[]>([]);
	let tokens = $state<Token[]>([]);
	let credentials = $state<Credential[]>([]);
	let setupToken = $state('');
	let newToken = $state('');
	let busy = $state(false);
	let error = $state('');
	let notice = $state('');
	let ready = $state(false);
	let passkeysSupported = $state(false);
	let loadedRequestId = $state<string | null>(null);
	let requestError = $state('');
	const requestId = $derived(page.url.searchParams.get('request'));

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
		if (session.authenticated) {
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
			error = cause instanceof Error && cause.name === 'NotAllowedError'
				? 'The passkey prompt was canceled or timed out. You can try again.'
				: cause instanceof Error && cause.name === 'Error' ? cause.message : 'The passkey could not be used. Please try again.';
		} finally { busy = false; }
	}
	onMount(() => {
		passkeysSupported = browserSupportsWebAuthn();
		void run(async () => {
			try { await refresh(); } finally { ready = true; }
		});
	});
	async function login() {
		await run(async () => {
			const challenge = await api<{ id: string; options: PublicKeyCredentialRequestOptionsJSON }>('/auth/passkey/login/options', {});
			const response = await startAuthentication({ optionsJSON: challenge.options });
			await api('/auth/passkey/login/verify', { id: challenge.id, response });
			await refresh(); notice = 'You are signed in.';
			if (page.url.searchParams.get('returnTo') === '/readwise') window.location.assign('/readwise');
		});
	}
	async function register() {
		await run(async () => {
			const authorization = session?.authenticated ? { csrf: session.csrf } : { setupToken };
			try {
				const challenge = await api<{ id: string; options: PublicKeyCredentialCreationOptionsJSON }>('/auth/passkey/register/options', authorization);
				const response = await startRegistration({ optionsJSON: challenge.options });
				await api('/auth/passkey/register/verify', { id: challenge.id, response, ...authorization });
				await refresh(); notice = 'Passkey added.';
			} finally { setupToken = ''; }
		});
	}
	function date(value: number) { return new Date(value < 1e12 ? value * 1000 : value).toLocaleString(); }
	async function consent() {
		await run(async () => {
			const result = await api<{ redirect: string }>('/auth/consent', { id: requestId, scope: selectedScopes, csrf: session?.csrf });
			window.location.assign(result.redirect);
		});
	}
	async function createToken() {
		await run(async () => {
			newToken = '';
			const result = await api<{ access_token: string }>('/auth/tokens', { scope: personalScopes, csrf: session?.csrf });
			newToken = result.access_token;
			await refresh();
		});
	}
</script>

<svelte:head><title>Account · Casey Gollan</title><meta name="robots" content="noindex, nofollow" /></svelte:head>

<Page as="main" width="wide" aria-busy={busy}>
	<PageHeader backHref="/" backText="Casey Gollan" tight>
		<Heading level={1} size="display">Account</Heading>
	</PageHeader>
	{#if error}<Notice tone="error">{error}</Notice>{/if}
	<p class="status" role="status" aria-live="polite">{busy ? 'Please wait…' : notice}</p>
	{#if !ready && !error}<p>Loading account…</p>{/if}
	{#if ready && !passkeysSupported}<Notice tone="error">This browser does not support passkeys. Open this page in a browser with passkey support to sign in or add a passkey.</Notice>{/if}
	{#if requestError}<Notice tone="error">{requestError}</Notice>{/if}
	{#if requestId && session && !session.authenticated}<p>Sign in to review this app's access request.</p>{/if}
	{#if session && !session.authenticated}
		<Section title="Owner sign-in">
			<p>Use a passkey to manage this site's connected apps and access tokens.</p>
			{#if session.credentialCount > 0}<Button variant="primary" disabled={busy || !passkeysSupported} onclick={login}>Sign in with passkey</Button>{/if}
			{#if session.setupAvailable}
				<Heading level={3} size="subtitle" class="subsection">Set up your account</Heading>
				<p>Enter the setup token provided by your site operator, then create your first passkey.</p>
				<form onsubmit={(event) => { event.preventDefault(); void register(); }}>
					<TextField label="Setup token" id="setup-token" type="password" autocomplete="off" bind:value={setupToken} required disabled={busy} />
					<Button type="submit" variant="primary" disabled={busy || !setupToken || !passkeysSupported}>Create first passkey</Button>
				</form>
			{/if}
		</Section>
	{/if}
	{#if request}
		<Section title="Connect an app">
			<p>This app is requesting access to your account. Review its address and permissions before continuing.</p>
			<dl><dt>App address</dt><dd>{request.clientId}</dd><dt>Return address</dt><dd>{request.redirectUri}</dd></dl>
			<fieldset disabled={busy || !session?.authenticated}><legend>Permissions</legend>
				{#each request.scope as scope}<Checkbox bind:group={selectedScopes} value={scope}><strong>{scope}</strong> — {scopes[scope] ?? 'Requested permission'}</Checkbox>{/each}
				{#if !request.scope.length}<p>Confirm your identity without granting additional permissions.</p>{/if}
			</fieldset>
			<div class="actions">
				{#if session?.authenticated}<Button variant="primary" disabled={busy} onclick={consent}>Allow access</Button>{:else}<p>Sign in to review and approve access.</p>{/if}
				<Button href="/account" variant="quiet">Cancel</Button>
			</div>
		</Section>
	{/if}
	{#if session?.authenticated}
		<p><a href="/readwise">Review Readwise bookmarks →</a></p>
		<Section title="Passkeys">
			<p>Keep a second passkey so you can sign in if a device is unavailable.</p>
			<Button disabled={busy || !passkeysSupported} onclick={register}>Add passkey</Button>
			<ul class="rows">{#each credentials as credential}<li><span>Passkey added {date(credential.createdAt)}{credential.backedUp ? ' · Backed up' : ''}</span>
				<Button size="sm" disabled={busy || credentials.length <= 1} aria-label={`Remove passkey added ${date(credential.createdAt)}`} onclick={() => run(async () => { await api('/auth/credentials/remove', { id: credential.id, csrf: session?.csrf }); await refresh(); notice = 'Passkey removed.'; })}>Remove</Button>
			</li>{/each}</ul>
			{#if credentials.length <= 1}<p class="hint">Your last passkey must remain on your account.</p>{/if}
		</Section>
		<Section title="Access tokens">
			<p>Tokens let apps act with the permissions you grant. Revoke a token to stop its access.</p>
			{#if tokens.length}<ul class="rows">{#each tokens as token}<li><div><strong>{token.clientId}</strong><br />Permissions: {token.scope || 'Identity only'}<br /><small>Created {date(token.createdAt)} · Expires {date(token.expiresAt)}</small></div>
				<Button size="sm" disabled={busy} aria-label={`Revoke access for ${token.clientId}`} onclick={() => run(async () => { await api('/auth/tokens/revoke', { id: token.id, csrf: session?.csrf }); newToken = ''; await refresh(); notice = 'Access revoked.'; })}>Revoke</Button>
			</li>{/each}</ul>{:else}<p class="hint">No active access tokens.</p>{/if}
			<Heading level={3} size="subtitle" class="subsection">Create a personal token</Heading>
			<fieldset disabled={busy}><legend>Token permissions</legend>{#each Object.entries(scopes) as [scope, description]}<Checkbox bind:group={personalScopes} value={scope}><strong>{scope}</strong> — {description}</Checkbox>{/each}</fieldset>
			<Button variant="primary" disabled={busy || !personalScopes.length} onclick={createToken}>Create token</Button>
			{#if newToken}<div class="token"><TextField multiline mono label="Copy your new token now. It will not be shown again." id="new-token" readonly value={newToken} spellcheck="false" autocomplete="off" />
				<div class="actions"><Button disabled={busy} onclick={() => run(async () => { await navigator.clipboard.writeText(newToken); notice = 'Token copied.'; })}>Copy token</Button>
				<Button variant="quiet" disabled={busy} onclick={() => { newToken = ''; }}>Dismiss token</Button></div></div>{/if}
		</Section>
		<Button disabled={busy} onclick={() => run(async () => { await api('/auth/logout', { csrf: session?.csrf }); newToken = ''; await refresh(); notice = 'You are signed out.'; })}>Sign out</Button>
	{/if}
</Page>

<style>
	:global(.subsection) { margin-top: var(--space-6); }
	a { color: inherit; text-decoration-thickness: from-font; text-underline-offset: var(--underline-offset); }
	.status { min-height: 1.5em; margin: var(--space-2) 0; color: var(--text-secondary); font-size: var(--fs-sm); }
	.status:empty { display: none; }
	.hint, small { color: var(--text-muted); font-size: var(--fs-sm); }
	.actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3) var(--space-4); margin-top: var(--space-3); }
	fieldset { display: flex; flex-direction: column; gap: var(--space-2); margin: var(--space-4) 0; padding: var(--space-3) var(--space-4) var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-sm); }
	legend { padding: 0 var(--space-2); color: var(--text-secondary); font-size: var(--fs-sm); }
	dt { color: var(--text-muted); font-size: var(--fs-sm); } dd { margin: 0 0 var(--space-3); overflow-wrap: anywhere; }
	.rows { margin: var(--space-4) 0; padding: 0; list-style: none; }
	.rows li { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); padding: var(--space-3) 0; border-top: 1px solid var(--border-subtle); font-variant-numeric: tabular-nums; }
	.token { margin: var(--space-4) 0; padding: var(--space-3) var(--space-4) var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-sm); }
</style>

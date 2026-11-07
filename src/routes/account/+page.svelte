<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
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

<main aria-busy={busy}>
	<a href="/">← Casey Gollan</a>
	<h1>Account</h1>
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	<p role="status" aria-live="polite">{busy ? 'Please wait…' : notice}</p>
	{#if !ready && !error}<p>Loading account…</p>{/if}
	{#if ready && !passkeysSupported}<p role="alert">This browser does not support passkeys. Open this page in a browser with passkey support to sign in or add a passkey.</p>{/if}
	{#if requestError}<p role="alert">{requestError}</p>{/if}
	{#if requestId && session && !session.authenticated}<p>Sign in to review this app's access request.</p>{/if}
	{#if session && !session.authenticated}
		<section aria-labelledby="signin-title">
			<h2 id="signin-title">Owner sign-in</h2>
			<p>Use a passkey to manage this site's connected apps and access tokens.</p>
			{#if session.credentialCount > 0}<button disabled={busy || !passkeysSupported} onclick={login}>Sign in with passkey</button>{/if}
			{#if session.setupAvailable}
				<h3>Set up your account</h3>
				<p>Enter the setup token provided by your site operator, then create your first passkey.</p>
				<form onsubmit={(event) => { event.preventDefault(); void register(); }}>
					<label for="setup-token">Setup token</label>
					<input id="setup-token" type="password" autocomplete="off" bind:value={setupToken} required disabled={busy} />
					<button disabled={busy || !setupToken || !passkeysSupported}>Create first passkey</button>
				</form>
			{/if}
		</section>
	{/if}
	{#if request}
		<section aria-labelledby="consent-title">
			<h2 id="consent-title">Connect an app</h2>
			<p>This app is requesting access to your account. Review its address and permissions before continuing.</p>
			<dl><dt>App address</dt><dd>{request.clientId}</dd><dt>Return address</dt><dd>{request.redirectUri}</dd></dl>
			<fieldset disabled={busy || !session?.authenticated}><legend>Permissions</legend>
				{#each request.scope as scope}<label class="choice"><input type="checkbox" bind:group={selectedScopes} value={scope} /><span><strong>{scope}</strong> — {scopes[scope] ?? 'Requested permission'}</span></label>{/each}
				{#if !request.scope.length}<p>Confirm your identity without granting additional permissions.</p>{/if}
			</fieldset>
			{#if session?.authenticated}<button disabled={busy} onclick={consent}>Allow access</button>{:else}<p>Sign in to review and approve access.</p>{/if}
			<a href="/account">Cancel</a>
		</section>
	{/if}
	{#if session?.authenticated}
		<p><a href="/readwise">Review Readwise bookmarks →</a></p>
		<section aria-labelledby="passkeys-title">
			<h2 id="passkeys-title">Passkeys</h2>
			<p>Keep a second passkey so you can sign in if a device is unavailable.</p>
			<button disabled={busy || !passkeysSupported} onclick={register}>Add passkey</button>
			<ul>{#each credentials as credential}<li><span>Passkey added {date(credential.createdAt)}{credential.backedUp ? ' · Backed up' : ''}</span>
				<button disabled={busy || credentials.length <= 1} aria-label={`Remove passkey added ${date(credential.createdAt)}`} onclick={() => run(async () => { await api('/auth/credentials/remove', { id: credential.id, csrf: session?.csrf }); await refresh(); notice = 'Passkey removed.'; })}>Remove</button>
			</li>{/each}</ul>
			{#if credentials.length <= 1}<p>Your last passkey must remain on your account.</p>{/if}
		</section>
		<section aria-labelledby="tokens-title">
			<h2 id="tokens-title">Access tokens</h2>
			<p>Tokens let apps act with the permissions you grant. Revoke a token to stop its access.</p>
			{#if tokens.length}<ul>{#each tokens as token}<li><div><strong>{token.clientId}</strong><br />Permissions: {token.scope || 'Identity only'}<br /><small>Created {date(token.createdAt)} · Expires {date(token.expiresAt)}</small></div>
				<button disabled={busy} aria-label={`Revoke access for ${token.clientId}`} onclick={() => run(async () => { await api('/auth/tokens/revoke', { id: token.id, csrf: session?.csrf }); newToken = ''; await refresh(); notice = 'Access revoked.'; })}>Revoke</button>
			</li>{/each}</ul>{:else}<p>No active access tokens.</p>{/if}
			<h3>Create a personal token</h3>
			<fieldset disabled={busy}><legend>Token permissions</legend>{#each Object.entries(scopes) as [scope, description]}<label class="choice"><input type="checkbox" bind:group={personalScopes} value={scope} /><span><strong>{scope}</strong> — {description}</span></label>{/each}</fieldset>
			<button disabled={busy || !personalScopes.length} onclick={createToken}>Create token</button>
			{#if newToken}<div class="token"><label for="new-token">Copy your new token now. It will not be shown again.</label><textarea id="new-token" readonly value={newToken} spellcheck="false" autocomplete="off"></textarea>
				<button disabled={busy} onclick={() => run(async () => { await navigator.clipboard.writeText(newToken); notice = 'Token copied.'; })}>Copy token</button>
				<button disabled={busy} onclick={() => { newToken = ''; }}>Dismiss token</button></div>{/if}
		</section>
		<button disabled={busy} onclick={() => run(async () => { await api('/auth/logout', { csrf: session?.csrf }); newToken = ''; await refresh(); notice = 'You are signed out.'; })}>Sign out</button>
	{/if}
</main>

<style>
	main { max-width: 48rem; margin: 0 auto; padding: 2rem 1.25rem 5rem; font-size: 1rem; font-weight: 400; overflow-wrap: anywhere; }
	h1 { font-size: 2.5rem; line-height: 1.2; } h2 { font-size: 1.5rem; } h3 { font-size: 1.15rem; }
	a { color: inherit; } section { padding: 1rem 0 2rem; border-bottom: 1px solid var(--border); margin-bottom: 1.5rem; }
	button, input, textarea { font: inherit; } button { padding: .55rem .9rem; margin: .4rem .5rem .4rem 0; border: 1px solid currentColor; border-radius: .25rem; background: transparent; color: inherit; cursor: pointer; }
	button:disabled { opacity: .5; cursor: default; } button:focus-visible, input:focus-visible, textarea:focus-visible, a:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
	input[type=password], textarea { display: block; box-sizing: border-box; width: 100%; margin: .5rem 0; padding: .65rem; background: var(--bg-primary); color: inherit; border: 1px solid currentColor; border-radius: .25rem; }
	textarea { min-height: 6rem; font-family: monospace; } fieldset { margin: 1rem 0; border: 1px solid var(--border); padding: 1rem; } .choice { display: flex; align-items: baseline; gap: .6rem; margin: .6rem 0; } input[type=checkbox] { flex-shrink: 0; }
	dt { font-weight: 700; } dd { margin: .25rem 0 1rem; } ul { padding: 0; list-style: none; } li { padding: 1rem 0; border-bottom: 1px solid var(--border); } small { color: var(--text-secondary); } .error { border: 1px solid currentColor; padding: 1rem; } .token { margin: 1rem 0; padding: 1rem; border: 1px solid currentColor; }
</style>

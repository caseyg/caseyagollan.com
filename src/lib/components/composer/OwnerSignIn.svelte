<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { browserSupportsWebAuthn } from '@simplewebauthn/browser';
	import { issuerName, passkeyError, previewSignInHref, previewSignInIssuer, signInWithPasskey } from '$lib/passkey-login';
	import { Button, Notice } from '$lib/components/ui';

	/** `signInWith` is the site a branch preview signs in through; it is looked up when not given. */
	let { message = 'Sign in to post.', signInWith }: { message?: string; signInWith?: string } = $props();
	let signingIn = $state(false);
	let signInError = $state('');
	let passkeysSupported = $state(false);
	let ready = $state(false);
	let issuer = $state<string | undefined>();
	const via = $derived(signInWith ?? issuer);
	// Signing in here sets the owner hint; pages clear it themselves once they see the session has ended.
	onMount(() => {
		passkeysSupported = browserSupportsWebAuthn();
		if (signInWith) { ready = true; return; }
		void previewSignInIssuer().then((value) => { issuer = value; ready = true; });
	});
	async function login() {
		if (signingIn) return;
		signingIn = true; signInError = '';
		try {
			await signInWithPasskey();
			window.location.replace(page.url.pathname + page.url.search + page.url.hash);
		} catch (cause) { signInError = passkeyError(cause); }
		finally { signingIn = false; }
	}
</script>

<p>{message}</p>
{#if via}
	<p>This is a preview, so you sign in with your passkey on {issuerName(via)} and come back here.</p>
	<Button variant="primary" href={previewSignInHref(page.url.pathname + page.url.search + page.url.hash)} data-sveltekit-reload>Sign in with {issuerName(via)}</Button>
{:else}
	{#if signInError}<Notice tone="error">{signInError}</Notice>{/if}
	{#if ready && !passkeysSupported}<Notice tone="error">This browser does not support passkeys. Open this page in a browser with passkey support to sign in.</Notice>{/if}
	<Button variant="primary" disabled={signingIn || !ready || !passkeysSupported} onclick={login}>{signingIn ? 'Signing in…' : 'Sign in with passkey'}</Button>
	<noscript><p>Enable JavaScript to sign in with your passkey.</p></noscript>
{/if}

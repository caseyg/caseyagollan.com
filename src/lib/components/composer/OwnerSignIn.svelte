<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { browserSupportsWebAuthn } from '@simplewebauthn/browser';
	import { passkeyError, signInWithPasskey } from '$lib/passkey-login';
	import { Button, Notice } from '$lib/components/ui';

	let { message = 'Sign in to post.' }: { message?: string } = $props();
	let signingIn = $state(false);
	let signInError = $state('');
	let passkeysSupported = $state(false);
	let ready = $state(false);
	// The owner hint is not cleared here: an expired session should still show Edit links, which lead back to sign-in.
	onMount(() => { passkeysSupported = browserSupportsWebAuthn(); ready = true; });
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
{#if signInError}<Notice tone="error">{signInError}</Notice>{/if}
{#if ready && !passkeysSupported}<Notice tone="error">This browser does not support passkeys. Open this page in a browser with passkey support to sign in.</Notice>{/if}
<Button variant="primary" disabled={signingIn || !passkeysSupported} onclick={login}>{signingIn ? 'Signing in…' : 'Sign in with passkey'}</Button>
<noscript><p>Enable JavaScript to sign in with your passkey.</p></noscript>

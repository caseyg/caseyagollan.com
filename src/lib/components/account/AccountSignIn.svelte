<script lang="ts">
	import { Button, Notice, Section, TextField } from '$lib/components/ui';
	import { issuerName, previewSignInHref } from '$lib/passkey-login';

	interface Props {
		/** The site a branch preview signs in through; unset on the site itself. */
		signInWith?: string;
		/** Where a preview sign-in comes back to. */
		returnTo?: string;
		/** Whether any passkey exists yet. */
		hasPasskey?: boolean;
		/** Whether the first passkey can still be made with the operator's setup token. */
		setupAvailable?: boolean;
		passkeysSupported?: boolean;
		busy?: boolean;
		/** Says what signing in is for, when the owner was sent here by an app. */
		reason?: string;
		onlogin?: () => void;
		/** Called with the setup token to make the first passkey. */
		onsetup?: (token: string) => void;
	}

	let { signInWith, returnTo = '/account', hasPasskey = true, setupAvailable = false, passkeysSupported = true, busy = false, reason, onlogin, onsetup }: Props = $props();

	let setupToken = $state('');
	function setup(event: SubmitEvent) {
		event.preventDefault();
		const token = setupToken;
		setupToken = '';
		onsetup?.(token);
	}
</script>

<!-- The whole page for a signed-out owner: one way in. -->
<Section title="Owner sign-in" variant="card">
	{#if reason}<p>{reason}</p>{/if}
	{#if signInWith}
		<p>This is a preview of the site. Sign in with your passkey on {issuerName(signInWith)} and you’ll come back here signed in. Publishing stays off on previews.</p>
		<Button variant="primary" href={previewSignInHref(returnTo)} data-sveltekit-reload>Sign in with {issuerName(signInWith)}</Button>
	{:else}
		{#if !passkeysSupported}<Notice tone="error">This browser does not support passkeys. Open this page in a browser with passkey support to sign in or add a passkey.</Notice>{/if}
		{#if hasPasskey}
			<p>Use your passkey to manage this site’s connections, newsletter and access.</p>
			<Button variant="primary" disabled={busy || !passkeysSupported} onclick={onlogin}>{busy ? 'Signing in…' : 'Sign in with passkey'}</Button>
		{/if}
		{#if setupAvailable}
			<form class="setup" class:first={!hasPasskey} onsubmit={setup}>
				<p>{hasPasskey ? 'Or enter' : 'Enter'} the setup token provided by your site operator, then create your first passkey.</p>
				<TextField label="Setup token" id="setup-token" type="password" autocomplete="off" bind:value={setupToken} required disabled={busy} />
				<Button type="submit" variant={hasPasskey ? 'secondary' : 'primary'} disabled={busy || !setupToken || !passkeysSupported}>Create first passkey</Button>
			</form>
		{/if}
	{/if}
</Section>

<style>
	.setup:not(.first) {
		margin-top: var(--space-5);
		padding-top: var(--space-4);
		border-top: 1px solid var(--border-subtle);
	}

	.setup p {
		margin: 0;
	}
</style>

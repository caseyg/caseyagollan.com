<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import AccessTokens from './AccessTokens.svelte';
	import AccountSignIn from './AccountSignIn.svelte';
	import ConsentRequest from './ConsentRequest.svelte';
	import Passkeys from './Passkeys.svelte';

	const day = 86_400_000;
	const now = Date.UTC(2026, 10, 25, 15);
	const noop = () => undefined;
	const preview = 'https://claude-project-thread-s3cflt-caseyagollan.caseygollan.workers.dev';
	const tokens = [
		{ id: 'a', name: 'Laptop publishing', clientId: 'https://caseyagollan.com/', scope: 'create update media', createdAt: now - 20 * day, expiresAt: now + 70 * day },
		{ id: 'b', clientId: 'https://quill.p3k.io/', scope: 'create', createdAt: now - 3 * day, expiresAt: now + 87 * day }
	];
	const { Story } = defineMeta({ title: 'Site/Account', tags: ['!autodocs'] });
</script>

<!-- An app asking only who is signing in, such as a branch preview: the page holds this and nothing else. -->
<Story asChild name="Consent, identity only">
	<div style="max-width: 38rem"><ConsentRequest clientId="{preview}/" redirectUri="{preview}/auth/preview/callback" scope={[]} onallow={noop} /></div>
</Story>

<!-- An app asking to act: each permission can be unticked before allowing. -->
<Story asChild name="Consent, with permissions">
	<div style="max-width: 38rem"><ConsentRequest clientId="https://quill.p3k.io/" redirectUri="https://quill.p3k.io/auth/callback" scope={['create', 'update', 'media']} onallow={noop} /></div>
</Story>

<!-- The return address is on another site than the app: said plainly. -->
<Story asChild name="Consent, returns elsewhere">
	<div style="max-width: 38rem"><ConsentRequest clientId="https://example.app/" redirectUri="https://elsewhere.example/callback" scope={['profile']} onallow={noop} /></div>
</Story>

<Story asChild name="Sign in">
	<div style="max-width: 38rem"><AccountSignIn onlogin={noop} /></div>
</Story>

<Story asChild name="Sign in, for an app">
	<div style="max-width: 38rem"><AccountSignIn reason="An app is asking for access. Sign in to review its request." onlogin={noop} /></div>
</Story>

<Story asChild name="Sign in, on a preview">
	<div style="max-width: 38rem"><AccountSignIn signInWith="https://caseyagollan.com" /></div>
</Story>

<Story asChild name="Sign in, first setup">
	<div style="max-width: 38rem"><AccountSignIn hasPasskey={false} setupAvailable onsetup={noop} /></div>
</Story>

<Story asChild name="Sign in, no passkey support">
	<div style="max-width: 38rem"><AccountSignIn passkeysSupported={false} onlogin={noop} /></div>
</Story>

<Story asChild name="Passkeys">
	<div style="max-width: 34rem"><Passkeys credentials={[{ id: 'a', createdAt: now - 60 * day, backedUp: true }, { id: 'b', createdAt: now - 7 * day }]} onadd={noop} onremove={noop} /></div>
</Story>

<!-- The last passkey can't be removed. -->
<Story asChild name="Passkeys, only one">
	<div style="max-width: 34rem"><Passkeys credentials={[{ id: 'a', createdAt: now - 60 * day, backedUp: true }]} onadd={noop} onremove={noop} /></div>
</Story>

<!-- The form for a new token opens from its button. -->
<Story asChild name="Access tokens">
	<div style="max-width: 34rem"><AccessTokens {tokens} oncreate={noop} onrevoke={noop} /></div>
</Story>

<Story asChild name="Access tokens, none">
	<div style="max-width: 34rem"><AccessTokens tokens={[]} oncreate={noop} onrevoke={noop} /></div>
</Story>

<!-- Just made: shown once, to copy. -->
<Story asChild name="Access tokens, new token">
	<div style="max-width: 34rem"><AccessTokens {tokens} newToken="b3JhbmdlLWp1aWNlLWlzLW5vdC1hLXJlYWwtdG9rZW4tYnV0LWl0LWlzLWxvbmc" oncreate={noop} onrevoke={noop} oncopy={noop} ondismiss={noop} /></div>
</Story>

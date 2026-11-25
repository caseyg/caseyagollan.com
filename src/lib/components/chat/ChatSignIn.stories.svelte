<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ChatSignIn from './ChatSignIn.svelte';

	const { Story } = defineMeta({ title: 'Chat/ChatSignIn', component: ChatSignIn, args: { returnTo: '/chat/a1b2c3d4e5' } });
</script>

<!-- Readers see one button. -->
<Story name="Closed" />

<!-- Then the three ways in: a website (IndieAuth), Mastodon or Bluesky. -->
<Story name="Website" args={{ open: true }} />

<Story name="Mastodon" args={{ open: true, provider: 'mastodon' }} />

<Story name="Bluesky" args={{ open: true, provider: 'bluesky' }} />

<Story name="Sign-in failed" args={{ open: true, error: 'jo.example doesn’t name an IndieAuth server. Add one, or sign in with Mastodon or Bluesky.' }} />

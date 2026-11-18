<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import RespondPanel from './RespondPanel.svelte';
	import type { WebmentionOutcome } from '$lib/respond';

	const url = 'https://caseyagollan.com/2025/09/27/6c526/';
	const copies = { mastodon: 'https://social.coop/@caseyg/115278138445265088', bluesky: 'https://bsky.app/profile/caseyagollan.com/post/3lztsw4r3wk2u' };
	const after = (outcome: WebmentionOutcome) => () => new Promise<WebmentionOutcome>((resolve) => setTimeout(() => resolve(outcome), 500));
	const openUrl = (href: string) => console.log('Would open', href);

	const { Story } = defineMeta({
		title: 'Posts/RespondPanel',
		component: RespondPanel,
		parameters: { docs: { story: { height: '320px' } } },
		args: { action: 'reply', url, copies, openUrl, send: after({ ok: true, status: 'queued' }) }
	});
</script>

<!-- What a Respond menu holds, drawn open. -->
<Story name="Reply" />

<Story name="Like" args={{ action: 'like' }} />

<Story name="Like, not syndicated" args={{ action: 'like', copies: {} }} />

<Story name="Repost, not syndicated" args={{ action: 'repost', copies: {}, title: 'A post title' }} />

<!-- The visitor names their server once; the browser remembers it. Handles like @me@mastodon.social work too. -->
<Story name="Mastodon server" args={{ view: 'mastodon' }} />

<Story name="Webmention" args={{ view: 'web' }} />

<Story name="Webmention rejected" args={{ view: 'web', send: after({ ok: false, status: 'invalid', message: 'Webmention.io said: source URL does not contain a link to the target URL' }) }} />

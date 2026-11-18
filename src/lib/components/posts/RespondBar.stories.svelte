<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import RespondBar from './RespondBar.svelte';
	import type { WebmentionOutcome } from '$lib/respond';

	const url = 'https://caseyagollan.com/2025/09/27/6c526/';
	const both = ['https://social.coop/@caseyg/115278138445265088', 'https://bsky.app/profile/caseyagollan.com/post/3lztsw4r3wk2u'];
	const send = () => new Promise<WebmentionOutcome>((resolve) => setTimeout(() => resolve({ ok: true, status: 'queued' }), 500));
	const openUrl = (href: string) => console.log('Would open', href);

	const { Story } = defineMeta({
		title: 'Posts/RespondBar',
		component: RespondBar,
		parameters: { docs: { story: { height: '420px' } } },
		args: { url, syndication: both, send, openUrl }
	});
</script>

<!-- Under every post page: Reply, Like and Repost. Each opens where to do it: the post's own copies on Bluesky and Mastodon, X, or the visitor's site. -->
<Story name="Syndicated to Bluesky and Mastodon" />

<!-- Only a Bluesky copy: Mastodon can still start a new post that links here, but not a like. -->
<Story name="Bluesky only" args={{ syndication: [both[1]] }} />

<!-- An article sent nowhere: Like offers only the visitor's site; Reply and Repost start new posts. -->
<Story name="Not syndicated" args={{ syndication: [], title: 'The rejection of the AI slop aesthetic' }} />

<Story name="Phone" parameters={{ viewport: { defaultViewport: 'mobile1' } }} />

<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import FeedMenu from './FeedMenu.svelte';
	import type { SubscribeOutcome } from '$lib/components/ui';

	const subscribed = () => new Promise<SubscribeOutcome>((resolve) => setTimeout(() => resolve({ ok: true, status: 'subscribed' }), 600));
	const openIt = async ({ canvasElement }: { canvasElement: HTMLElement }) => canvasElement.querySelector<HTMLElement>('.feed-menu-trigger')?.click();

	const { Story } = defineMeta({
		title: 'Posts/FeedMenu',
		component: FeedMenu,
		parameters: { docs: { story: { height: '420px' } }, layout: 'centered' },
		args: { submit: subscribed }
	});
</script>

<!-- The gray Subscribe control at the top of the posts feed. -->
<Story name="Default" />

<!-- Email signup first (SubscribeForm, sent to Buttondown by the Worker), then RSS, Atom and JSON Feed. -->
<Story name="Open" play={openIt} />

<!-- Feeds only, where email signup is not wanted. -->
<Story name="Feeds only" args={{ email: false }} play={openIt} />

<Story name="One feed" args={{ feeds: [{ path: '/feed.xml', label: 'RSS', mime: 'application/rss+xml', icon: 'rss' }], label: 'Follow' }} play={openIt} />

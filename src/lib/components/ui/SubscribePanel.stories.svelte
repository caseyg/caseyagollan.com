<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import SubscribePanel from './SubscribePanel.svelte';
	import Prose from './Prose.svelte';
	import type { SubscribeOutcome } from './SubscribeForm.svelte';
	import { renderContent } from '$lib/utils/renderContent';

	const subscribed = () => new Promise<SubscribeOutcome>((resolve) => setTimeout(() => resolve({ ok: true, status: 'subscribed' }), 600));
	const post = renderContent('Follow along here:\n\nhttps://caseyagollan.com/subscribe');

	const { Story } = defineMeta({
		title: 'Primitives/SubscribePanel',
		component: SubscribePanel,
		parameters: { docs: { story: { height: '320px' } } },
		args: { submit: subscribed }
	});
</script>

<!-- Email first (SubscribeForm), then RSS, Atom and JSON Feed from SITE_FEEDS. The Subscribe menu on /posts and the /subscribe page show this. -->
<Story name="Default" />

<Story name="Feeds only" args={{ email: false }} />

<!-- The answer to a signup sent without JavaScript, read back from `?subscribe=`. -->
<Story name="Signed up without JavaScript" args={{ initial: 'subscribed' }} />

<Story name="Signup not set up" args={{ initial: 'unavailable' }} />

<!-- In a post: a bare caseyagollan.com/subscribe link on its own line. Prose draws the panel; feeds and email keep the written sentence. -->
<Story name="In a post" asChild>
	<div style="max-width: 36rem">
		<Prose>{@html post}</Prose>
	</div>
</Story>

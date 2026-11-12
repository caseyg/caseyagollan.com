<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import SocialCard from './SocialCard.svelte';
	const { Story } = defineMeta({
		title: 'Posts/SocialCard', component: SocialCard,
		args: { published: '2026-01-10T12:00:00-05:00', url: '/2026/01/10/storybook-note/' }
	});
</script>

<Story name="NativePost"><p>A thought shared from the site, with author and publication details.</p></Story>
<Story name="SavedMarkup" args={{ html: '<div class="social-snapshot"><p>A saved social post rendered from sanitized markup.</p></div>' }} />
<Story name="Thread" args={{ variant: 'thread' }}>
 <SocialCard><p>The first post in a conversation.</p></SocialCard>
 <SocialCard><p>The next post shares the conversation shell.</p></SocialCard>
</Story>

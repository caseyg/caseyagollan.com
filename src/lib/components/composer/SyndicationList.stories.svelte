<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import SyndicationList from './SyndicationList.svelte';
	import ComposerButton from './ComposerButton.svelte';

	const { Story } = defineMeta({ title: 'Composer/SyndicationList', component: SyndicationList, tags: ['!autodocs'] });
	const bluesky = 'https://bsky.app/profile/caseyagollan.com/post/3mzoozs6d4tqh';
	const mastodon = 'https://social.coop/@caseyg/117572962830652076';
</script>

<Story name="Posted everywhere">
	<SyndicationList destinations={[{ service: 'bluesky', name: 'Bluesky', links: [bluesky] }, { service: 'mastodon', name: 'Mastodon', links: [mastodon] }]} />
</Story>

<Story name="Not posted yet">
	<SyndicationList destinations={[{ service: 'bluesky', name: 'Bluesky', links: [], available: true }, { service: 'mastodon', name: 'Mastodon', links: [], available: false }]} />
</Story>

<Story name="Needs review">
	<SyndicationList destinations={[{ service: 'bluesky', name: 'Bluesky', links: [], pending: true }, { service: 'mastodon', name: 'Mastodon', links: [mastodon] }]}>
		<ComposerButton>Save links to the post</ComposerButton>
	</SyndicationList>
</Story>

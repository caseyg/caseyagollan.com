<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import QuotedPost from './QuotedPost.svelte';
	import { savedPost } from '$lib/storybook/fixtures';

	const { Story } = defineMeta({ title: 'Composer/QuotedPost', component: QuotedPost, tags: ['!autodocs'] });
</script>

<Story name="Saved post">
	<QuotedPost url={savedPost.url} networks={['Bluesky']} snapshot={savedPost} />
</Story>

<Story name="Link only">
	<QuotedPost url="https://social.coop/@example/117572962830652076" networks={['Mastodon']} />
</Story>

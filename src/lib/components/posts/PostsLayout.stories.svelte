<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import PostsLayout from './PostsLayout.svelte';
	import PostFeed from './PostFeed.svelte';
	import ArchiveHeader from './ArchiveHeader.svelte';
	import { note, article } from '$lib/storybook/fixtures';
	const { Story } = defineMeta({ title: 'Posts/PostsLayout', component: PostsLayout, parameters: { layout: 'fullscreen' } });
</script>

<Story name="Feed">
	<ArchiveHeader title="All Posts" count={2} />
	<PostFeed posts={[note, { ...article, slug: 'article' }]} />
</Story>

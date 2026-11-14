<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import FilterablePostFeed from './FilterablePostFeed.svelte';
	import PostsLayout from './PostsLayout.svelte';
	import DateArchiveHeader from './DateArchiveHeader.svelte';
	import { note, article, bookmark, photo } from '$lib/storybook/fixtures';

	const { Story } = defineMeta({ title: 'Posts/FilterablePostFeed', component: FilterablePostFeed, parameters: { layout: 'fullscreen' }, tags: ['!autodocs'] });
	const postsByDay: [string, (typeof note)[]][] = [
		['2026-01-10', [note, { ...article, slug: 'article' }, { ...photo, slug: 'photo' }]],
		['2026-01-08', [{ ...bookmark, slug: 'bookmark' }]]
	];
</script>

<!-- An archive page: the feed hands its type filter to the page header, which places it beside the pinned trail. -->
<Story asChild name="DateArchive">
	<PostsLayout>
		<FilterablePostFeed {postsByDay}>
			{#snippet header(filter)}
				<DateArchiveHeader year="2026" month="01" count={4} actions={filter} />
			{/snippet}
		</FilterablePostFeed>
	</PostsLayout>
</Story>

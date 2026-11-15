<script lang="ts">
	import type { PageData } from './$types';
	import Nav from '$lib/components/Nav.svelte';
	import { PostFeed, PostsLayout } from '$lib/components/posts';
	import { PageHeader, Pagination } from '$lib/components/ui';
	import { postsCrumb } from '$lib/components/posts/trail';
	import { typesHref } from '$lib/posts-filter';

	let { data }: { data: PageData } = $props();

	const available = $derived(data.typeOptions.map((option) => option.type));
	const filtered = $derived(data.selectedTypes.length < available.length);
	const shownLabel = $derived(
		data.typeOptions
			.filter((option) => data.selectedTypes.includes(option.type))
			.map((option) => option.label)
			.join(', ')
	);
	const pageHref = (page: number) => typesHref(data.selectedTypes, available, page);
</script>

<svelte:head>
	<title>{filtered ? shownLabel : 'Posts'}{data.page > 1 ? ` - Page ${data.page}` : ''} - Casey Gollan</title>
	<meta name="description" content="Posts, notes, and bookmarks by Casey Gollan" />
	<meta property="og:title" content="Posts - Casey Gollan" />
	<meta property="og:type" content="website" />
	{#if filtered}<meta name="robots" content="noindex, follow" />{/if}
</svelte:head>

<Nav currentPage="posts" />

<PostsLayout>
	<PageHeader
		trail={[{ ...postsCrumb('all', { options: data.typeOptions, selected: data.selectedTypes, href: (types) => typesHref(types, available) }), current: true }]}
		title={filtered ? shownLabel : 'Posts'}
	/>
	{#if data.totalPosts === 0}
		<p class="empty">No posts of these types yet.</p>
	{/if}
	<PostFeed postsByDay={data.postsByDay} />
	<Pagination
		label="Posts pagination"
		page={data.page}
		totalPages={data.totalPages}
		prevHref={data.page > 1 ? pageHref(data.page - 1) : undefined}
		nextHref={data.page < data.totalPages ? pageHref(data.page + 1) : undefined}
	/>
</PostsLayout>

<style>
	.empty {
		color: var(--text-muted);
	}
</style>

<script lang="ts">
	import type { PageData } from './$types';
	import Nav from '$lib/components/Nav.svelte';
	import { PostFeed, DropdownArchiveHeader, PostsLayout, PostTypeFilter } from '$lib/components/posts';
	import { typesHref, type PostType } from '$lib/posts-filter';

	let { data }: { data: PageData } = $props();

	const available = $derived(data.typeOptions.map((option) => option.type));

	function capitalizeFirst(str: string): string {
		return str.charAt(0).toUpperCase() + str.slice(1);
	}
</script>

<svelte:head>
	<title>{capitalizeFirst(data.typePlural)} - Casey Gollan</title>
	<meta name="description" content="{capitalizeFirst(data.typePlural)} by Casey Gollan" />
	<meta property="og:title" content="{capitalizeFirst(data.typePlural)} - Casey Gollan" />
	<meta property="og:type" content="website" />
</svelte:head>

<Nav currentPage="posts" />

<PostsLayout>
	<DropdownArchiveHeader
		current={capitalizeFirst(data.typePlural)}
		currentIcon={data.typeIcon}
		options={data.allTypes}
		count={data.totalPosts}
	/>

	<!-- One type is the main feed's solo view; changing the selection continues in the main feed. -->
	<PostTypeFilter
		options={data.typeOptions}
		selected={[data.type as PostType]}
		href={(types) => typesHref(types, available)}
	/>

	<PostFeed postsByDay={data.postsByDay} showType={false} />
</PostsLayout>

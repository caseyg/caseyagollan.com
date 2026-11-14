<script lang="ts">
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import PostFeed from './PostFeed.svelte';
	import PostTypeFilter from './PostTypeFilter.svelte';
	import { entryTypes, localTypesHref, parseTypesParam, typeFilterOptions } from '$lib/posts-filter';
	import type { Post } from '$lib/posts-types';

	interface Props {
		/** Every post on the page, as `[dateKey, posts]` pairs; archives are not paginated. */
		postsByDay?: [string, Post[]][];
		posts?: Post[];
		showType?: boolean;
		activeTag?: string;
	}

	let { postsByDay, posts, showType = true, activeTag }: Props = $props();

	const entries = $derived(posts ?? postsByDay?.flatMap(([, day]) => day) ?? []);
	const options = $derived(typeFilterOptions(entries.map(entryTypes)));
	const available = $derived(options.map((option) => option.type));
	// Archive pages are prerendered, so `?types=` is only readable once the page runs in the browser.
	const selected = $derived.by(() => {
		const chosen = browser ? parseTypesParam(page.url.searchParams.get('types'), available) : new Set();
		return chosen.size ? available.filter((type) => chosen.has(type)) : available;
	});
	const shown = $derived(new Set(selected));
	const keep = (post: Post) => entryTypes(post).some((type) => shown.has(type));
	const visibleByDay = $derived(
		postsByDay?.map(([day, list]) => [day, list.filter(keep)] as [string, Post[]]).filter(([, list]) => list.length)
	);
	const visible = $derived(posts?.filter(keep));
</script>

<PostTypeFilter {options} {selected} href={(types) => localTypesHref(page.url.pathname, types, available)} />
<PostFeed postsByDay={visibleByDay} posts={visible} {showType} {activeTag} />

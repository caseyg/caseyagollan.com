<script lang="ts">
	import type { Snippet } from 'svelte';
	import { PageHeader, type Segment } from '$lib/components/ui';
	import { postsCrumb } from './trail';

	interface Props {
		year: string;
		month?: string;
		day?: string;
		count?: number;
		/** Set on a single post, where the trail leads to the page instead of naming it. */
		parent?: boolean;
		actions?: Snippet;
		/** A small control pinned beside the trail, such as the archive's Subscribe menu. */
		pinned?: Snippet;
	}

	let { year, month, day, count, parent = false, actions, pinned }: Props = $props();

	const title = $derived.by(() => {
		if (!month) return `Posts from ${year}`;
		const date = new Date(`${year}-${month}-${day ?? '01'}`);
		return `Posts from ${date.toLocaleDateString('en-US', { month: 'long', day: day ? 'numeric' : undefined, year: 'numeric', timeZone: 'UTC' })}`;
	});

	// Posts, then the date from year down. The deepest segment is the page being viewed and carries the count.
	const trail = $derived.by(() => {
		const list: Segment[] = [postsCrumb(), { label: year, href: `/${year}/` }];
		if (month) list.push({ label: month, href: `/${year}/${month}/` });
		if (month && day) list.push({ label: day, href: `/${year}/${month}/${day}/` });
		if (!parent) list[list.length - 1] = { ...list[list.length - 1], current: true, count };
		return list;
	});
</script>

<PageHeader {trail} title={parent ? undefined : title} {actions} {pinned} />

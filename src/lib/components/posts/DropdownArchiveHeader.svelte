<script lang="ts">
	import type { Snippet } from 'svelte';
	import { PageHeader, type MenuOption } from '$lib/components/ui';
	import { postsCrumb, TAGS_CRUMB, type TrailFilter } from './trail';

	interface Props {
		current: string;
		currentIcon?: string;
		/** Sibling archives to switch to from the last segment. */
		options: MenuOption[];
		count?: number;
		countDescription?: string;
		/** Lets the Posts menu narrow this page by post type. */
		filter?: TrailFilter;
		actions?: Snippet;
	}

	let { current, currentIcon, options, count, countDescription, filter, actions }: Props = $props();
</script>

<PageHeader
	trail={[postsCrumb(`tag:${current.replace(/^#/, '').toLowerCase()}`, filter), TAGS_CRUMB, { label: current, href: '', icon: currentIcon, count, menu: options, current: true }]}
	title={current}
	description={countDescription}
	{actions}
/>

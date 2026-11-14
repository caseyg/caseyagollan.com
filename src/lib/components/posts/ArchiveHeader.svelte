<script lang="ts">
	import type { Snippet } from 'svelte';
	import { PageHeader } from '$lib/components/ui';
	import { POSTS_CRUMB } from './trail';

	interface Props {
		title: string;
		count: number;
		actions?: Snippet;
	}

	let { title, count, actions }: Props = $props();
</script>

<PageHeader trail={[POSTS_CRUMB, { label: title, href: '', current: true, count }]} {title} {actions} />

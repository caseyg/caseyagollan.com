<script lang="ts">
	import type { Snippet } from 'svelte';
	import { PageHeader, type MenuOption } from '$lib/components/ui';
	import { POSTS_CRUMB } from './trail';

	interface Props {
		current: string;
		currentIcon?: string;
		/** Sibling archives to switch to from the last segment. */
		options: MenuOption[];
		count?: number;
		countDescription?: string;
		actions?: Snippet;
	}

	let { current, currentIcon, options, count, countDescription, actions }: Props = $props();
</script>

<PageHeader
	trail={[POSTS_CRUMB, { label: current, href: '', icon: currentIcon, count, menu: options }]}
	title={current}
	description={countDescription}
	{actions}
/>

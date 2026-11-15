<script lang="ts">
	import type { Snippet } from 'svelte';
	import { PageHeader } from '$lib/components/ui';
	import { postsCrumb } from './trail';

	interface Props {
		title: string;
		count: number;
		icon?: string;
		/** Value of this archive's entry in the Posts menu. */
		menuActive?: string;
		actions?: Snippet;
	}

	let { title, count, icon, menuActive, actions }: Props = $props();
</script>

<PageHeader trail={[postsCrumb(menuActive), { label: title, href: '', icon, current: true, count }]} {title} {actions} />

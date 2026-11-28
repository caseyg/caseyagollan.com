<script lang="ts">
	import { TABLE_POST_CHOICES, type TablePostAs } from '$lib/table-post';
	import Button from '../ui/Button.svelte';
	import ContextMenu, { type ContextMenuItem } from '../ui/ContextMenu.svelte';

	interface Props {
		/** Whether visitors can see the table; an embed of a draft shows them nothing until it is published. */
		published?: boolean;
		/** A post is being made: the button waits. */
		busy?: boolean;
		onpost: (as: TablePostAs) => void;
	}

	let { published = true, busy = false, onpost }: Props = $props();

	let menu = $state<ContextMenu>();
	let holder = $state<HTMLSpanElement>();
	let open = $state(false);

	const items = $derived<ContextMenuItem[]>(
		TABLE_POST_CHOICES.map((choice) => (choice.value === 'embed' && !published ? { ...choice, hint: 'Readers see it once the table is published' } : choice))
	);

	async function press() {
		const box = holder?.getBoundingClientRect();
		if (!box) return;
		open = true;
		try {
			await menu?.openAt({ x: box.left, y: box.top - 2 });
		} finally {
			open = false;
		}
	}
</script>

<!-- The table toolbar's Post button: starts a draft post with the table in it, live or as a picture. -->
<span class="table-post-menu" bind:this={holder}>
	<Button variant="quiet" size="sm" icon="drafts" aria-haspopup="menu" aria-expanded={open} disabled={busy} onclick={press} title="Start a draft post with this table in it">{busy ? 'Posting…' : 'Post'}</Button>
</span>
<ContextMenu bind:this={menu} title="New draft post" {items} onAction={(value) => onpost(value as TablePostAs)} />

<style>
	.table-post-menu {
		display: inline-flex;
		flex: none;
	}
</style>

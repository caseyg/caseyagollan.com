<script lang="ts">
	import { Button, ContextMenu, type ContextMenuItem } from '$lib/components/ui';
	import type { ManagedChat } from './manage.svelte';

	interface Props {
		chat: ManagedChat;
		/** Archive it, or bring it back when it is archived. */
		onarchive: (chat: ManagedChat) => void;
		/** Delete it; whoever handles this asks first. */
		ondelete: (chat: ManagedChat) => void;
		/** Whether the menu is open, for a row that shows its button only on hover. */
		open?: boolean;
	}

	let { chat, onarchive, ondelete, open = $bindable(false) }: Props = $props();

	let menu = $state<ContextMenu>();
	let holder = $state<HTMLSpanElement>();

	const items = $derived<ContextMenuItem[]>([
		chat.archivedAt ? { value: 'archive', label: 'Unarchive', hint: 'Back to the list of chats' } : { value: 'archive', label: 'Archive', hint: 'Out of the list, kept under Archived' },
		{ value: 'delete', label: 'Delete…', destructive: true }
	]);

	async function show(point: { x: number; y: number }) {
		open = true;
		try { await menu?.openAt(point); } finally { open = false; }
	}

	/** Opens the menu at a point, such as a right-click on the chat's row. */
	export function openAt(point: { x: number; y: number }) { return show(point); }

	function press() {
		const box = holder?.getBoundingClientRect();
		if (box) void show({ x: box.left, y: box.bottom + 2 });
	}

	function act(value: string) {
		if (value === 'archive') onarchive(chat);
		else if (value === 'delete') ondelete(chat);
	}
</script>

<!-- A chat's ⋯ button: Archive (or Unarchive) and Delete, in the site's context menu. -->
<span class="chat-actions-menu" bind:this={holder}>
	<Button variant="icon" size="sm" icon="more" label="Actions for {chat.title}" aria-haspopup="menu" aria-expanded={open} onclick={press} />
</span>
<ContextMenu bind:this={menu} title={chat.title} {items} onAction={act} />

<style>
	.chat-actions-menu {
		display: inline-flex;
	}
</style>

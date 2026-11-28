<script module lang="ts">
	import type { IconName } from '../ui/Icon.svelte';

	export type ToolId = 'select' | 'hand' | 'note' | 'text' | 'draw' | 'arrow' | 'eraser';

	export const TOOLS: { id: ToolId; label: string; icon: IconName; key: string }[] = [
		{ id: 'select', label: 'Select', icon: 'pointer', key: 'V' },
		{ id: 'hand', label: 'Pan', icon: 'hand', key: 'H' },
		{ id: 'note', label: 'Note', icon: 'sticky', key: 'N' },
		{ id: 'text', label: 'Text', icon: 'type', key: 'T' },
		{ id: 'draw', label: 'Draw', icon: 'pencil', key: 'D' },
		{ id: 'arrow', label: 'Arrow', icon: 'arrow', key: 'A' },
		{ id: 'eraser', label: 'Eraser', icon: 'eraser', key: 'E' }
	];
</script>

<script lang="ts">
	import { setContext } from 'svelte';
	import { Toolbar } from '@ui-sdk/svelte/toolbar';
	import type { TablePostAs } from '$lib/table-post';
	import Button from '../ui/Button.svelte';
	import TablePostMenu from './TablePostMenu.svelte';

	interface Props {
		/** The owner gets the drawing tools and the block picker; visitors only fit the view. */
		editable?: boolean;
		tool?: string;
		canUndo?: boolean;
		canRedo?: boolean;
		/** Whether the block picker is open. */
		adding?: boolean;
		/** Save state, e.g. "Saved" or "Saving…". */
		status?: string;
		ontool?: (tool: ToolId) => void;
		onundo?: () => void;
		onredo?: () => void;
		onfit?: () => void;
		onadd?: () => void;
		/** Whether visitors can see the table. With `onpublish`, the owner gets Publish or Unpublish. */
		published?: boolean;
		onpublish?: (published: boolean) => void;
		/** Whether the selected blocks show their details; with `ondetails`, the owner gets a Details toggle while blocks are selected. */
		details?: 'shown' | 'hidden' | 'mixed';
		ondetails?: (shown: boolean) => void;
		/**
		 * With `ontags`, the owner gets a Tags button: it opens the tag panel for the selection (or the
		 * whole table). `count` is how many things have tag changes not saved yet.
		 */
		tags?: { open: boolean; count: number };
		ontags?: () => void;
		/** With `onpost`, the owner gets Post: a draft post with the table in it, live or as a picture. */
		onpost?: (as: TablePostAs) => void;
		/** A post is being made from the table. */
		posting?: boolean;
	}

	let { editable = false, tool = 'select', canUndo = false, canRedo = false, adding = false, status, ontool, onundo, onredo, onfit, onadd, published = false, onpublish, details, ondetails, tags, ontags, onpost, posting = false }: Props = $props();

	// Buttons inside join the toolbar: one tab stop, with arrow keys between them.
	setContext('ui:toolbar', true);
</script>

<Toolbar class="table-toolbar" aria-label="Table">
	{#if editable}
		<Button variant="primary" size="sm" icon="plus" pressed={adding} onclick={onadd} aria-expanded={adding}>Add</Button>
		<span class="divider" aria-hidden="true"></span>
		{#each TOOLS as entry (entry.id)}
			<Button variant="icon" icon={entry.icon} label="{entry.label} ({entry.key})" pressed={tool === entry.id} onclick={() => ontool?.(entry.id)} />
		{/each}
		<span class="divider" aria-hidden="true"></span>
		<Button variant="icon" icon="undo" label="Undo" disabled={!canUndo} onclick={onundo} />
		<Button variant="icon" icon="redo" label="Redo" disabled={!canRedo} onclick={onredo} />
		{#if details && ondetails}
			<span class="divider" aria-hidden="true"></span>
			<Button variant="quiet" size="sm" icon="properties" pressed={details === 'shown'} onclick={() => ondetails(details !== 'shown')} title={details === 'shown' ? 'Hide the selected blocks’ source line and kind tile' : 'Show the selected blocks’ source line and kind tile'}>Details</Button>
		{/if}
		{#if tags && ontags}
			<span class="divider" aria-hidden="true"></span>
			<Button variant="quiet" size="sm" icon="hash" pressed={tags.open} aria-expanded={tags.open} onclick={ontags} title={tags.count ? `${tags.count} with tag changes not saved yet` : 'Read and change tags: posts, Raindrop bookmarks, Readwise'}>Tags{#if tags.count}<span class="pending" aria-label="{tags.count} not saved">{tags.count}</span>{/if}</Button>
		{/if}
	{/if}
	<Button variant="icon" icon="fit" label="Fit to screen" onclick={onfit} />
	{#if status}<span class="status" role="status">{status}</span>{/if}
	{#if editable && onpublish}
		<span class="divider" aria-hidden="true"></span>
		{#if onpost}<TablePostMenu {published} busy={posting} {onpost} />{/if}
		{#if published}
			<Button variant="quiet" size="sm" onclick={() => onpublish(false)} title="Make this a draft only you can see">Unpublish</Button>
		{:else}
			<span class="draft">Draft</span>
			<Button variant="secondary" size="sm" onclick={() => onpublish(true)} title="Let anyone see this table, and embed it in posts">Publish</Button>
		{/if}
	{/if}
</Toolbar>

<style>
	:global(.table-toolbar) {
		display: flex;
		align-items: center;
		gap: 2px;
		padding: var(--space-1);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--bg-primary);
		box-shadow: 0 6px 24px rgb(0 0 0 / 0.18);
		font-size: var(--fs-sm);
		max-width: calc(100vw - 2 * var(--space-4));
		overflow-x: auto;
		scrollbar-width: none;
	}

	:global(.table-toolbar .button--primary) {
		margin-right: 2px;
	}

	.divider {
		flex: none;
		width: 1px;
		height: 1.25rem;
		margin: 0 var(--space-1);
		background: var(--border);
	}

	.status {
		flex: none;
		padding: 0 var(--space-2);
		color: var(--text-muted);
		font-size: var(--fs-xs);
		white-space: nowrap;
	}

	/* How many things have tag changes waiting to be saved. */
	.pending {
		margin-left: var(--space-1);
		padding: 0 0.4em;
		border-radius: var(--radius-full);
		background: var(--text-primary);
		color: var(--bg-primary);
		font-size: var(--fs-xs);
		font-weight: var(--fw-semibold);
		line-height: 1.4;
	}

	.draft {
		flex: none;
		padding: 0 var(--space-2);
		color: var(--text-secondary);
		font-size: var(--fs-xs);
		font-weight: var(--fw-semibold);
	}

	@media (max-width: 600px) {
		.status {
			display: none;
		}
	}
</style>

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
	import Button from '../ui/Button.svelte';

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
	}

	let { editable = false, tool = 'select', canUndo = false, canRedo = false, adding = false, status, ontool, onundo, onredo, onfit, onadd }: Props = $props();

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
	{/if}
	<Button variant="icon" icon="fit" label="Fit to screen" onclick={onfit} />
	{#if status}<span class="status" role="status">{status}</span>{/if}
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

	@media (max-width: 600px) {
		.status {
			display: none;
		}
	}
</style>

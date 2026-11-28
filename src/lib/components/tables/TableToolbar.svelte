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
	import { layoutScopes, moreToolFor, MORE_TOOLS, TABLE_LAYOUTS, toolChoice, type LayoutScope } from '$lib/table-menus';
	import ActionMenu from '../ui/ActionMenu.svelte';
	import type { TablePostAs } from '$lib/table-post';
	import Button from '../ui/Button.svelte';
	import VoiceControl, { type VoiceView } from './VoiceControl.svelte';
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
		/** The shape the geo tool draws, so More can show it while it is in hand. */
		geo?: string;
		/** A tool from the bar, or one of tldraw's others from More (`geo` with its shape). */
		ontool?: (tool: ToolId | string, geo?: string) => void;
		/** With `onmedia`, More offers pictures and videos from this device. */
		onmedia?: (files: File[]) => void;
		/**
		 * What is selected (`type` tells an area from the rest). With `onlayout`, the owner gets a
		 * Layout menu: it sets out the selection, or the whole table, as the layout chosen.
		 */
		selection?: { id: string; type?: string }[];
		onlayout?: (layout: string, scope: LayoutScope) => void;
		/**
		 * The layout the table is kept in as things are added, when auto layout is on. With
		 * `onautolayout`, the Layout menu gets the switch; a layout chosen for the whole table
		 * while it is on becomes the one kept (null turns it off).
		 */
		autoLayout?: string;
		onautolayout?: (layout: string | null) => void;
		/** Which way the menus open: up, as the bar sits at the bottom of the page. */
		menuSide?: 'top' | 'bottom';
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
		/**
		 * With `onvoice`, the owner gets the voice note: a microphone that writes what is said onto the
		 * table as text blocks, and its choices (`onvoicecorrect`, `onvoicearrange`, `onvoicecommands`).
		 */
		voice?: VoiceView;
		onvoice?: () => void;
		onvoicecorrect?: (on: boolean) => void;
		onvoicearrange?: (on: boolean) => void;
		onvoicecommands?: (on: boolean) => void;
		onvoicemeter?: (on: boolean) => void;
	}

	let { editable = false, tool = 'select', geo, onmedia, selection = [], onlayout, autoLayout, onautolayout, menuSide = 'top', canUndo = false, canRedo = false, adding = false, status, ontool, onundo, onredo, onfit, onadd, published = false, onpublish, details, ondetails, tags, ontags, onpost, posting = false, voice, onvoice, onvoicecorrect, onvoicearrange, onvoicecommands, onvoicemeter }: Props = $props();

	// Buttons inside join the toolbar: one tab stop, with arrow keys between them.
	setContext('ui:toolbar', true);

	let picker: HTMLInputElement;
	const extra = $derived(moreToolFor(tool, geo));
	const moreTools = $derived(onmedia ? MORE_TOOLS : MORE_TOOLS.filter((item) => item.value !== 'media'));

	function more(value: string) {
		if (value === 'media') return picker.click();
		const choice = toolChoice(value);
		if (choice) ontool?.(choice.tool, choice.geo);
	}

	const scopes = $derived(layoutScopes(selection));
	/** What the Layout menu sets out; a selection made after choosing the whole table takes over again. */
	let wanted = $state<LayoutScope>('selection');
	$effect(() => {
		if (!scopes.selection) wanted = 'selection';
	});
	const scope = $derived<LayoutScope>(scopes.selection ? wanted : 'table');

	function layOut(layout: string) {
		onlayout?.(layout, scope);
		if (autoLayout && scope === 'table') onautolayout?.(layout);
	}

	/** Turning auto layout on lays the table out at once, as it will be kept. */
	function auto(on: boolean) {
		onautolayout?.(on ? 'auto' : null);
		if (on) onlayout?.('auto', 'table');
	}
</script>

<Toolbar class="table-toolbar" aria-label="Table">
	{#if editable}
		<Button variant="primary" size="sm" icon="plus" pressed={adding} onclick={onadd} aria-expanded={adding}>Add</Button>
		<span class="divider" aria-hidden="true"></span>
		{#each TOOLS as entry (entry.id)}
			<Button variant="icon" icon={entry.icon} label="{entry.label} ({entry.key})" pressed={tool === entry.id} onclick={() => ontool?.(entry.id)} />
		{/each}
		<ActionMenu label={extra ? `More tools: ${extra.label}` : 'More tools'} icon={extra?.icon ?? 'shapes'} iconOnly items={moreTools} pressed={!!extra} side={menuSide} onaction={more} />
		{#if onmedia}
			<input bind:this={picker} class="media" type="file" accept="image/*,video/*" multiple tabindex="-1" aria-hidden="true" onchange={() => { onmedia([...(picker.files ?? [])]); picker.value = ''; }} />
		{/if}
		{#if voice && onvoice}
			<span class="divider" aria-hidden="true"></span>
			<VoiceControl {voice} ontoggle={onvoice} oncorrect={onvoicecorrect} onarrange={onvoicearrange} oncommands={onvoicecommands} onmeter={onvoicemeter} />
		{/if}
		<span class="divider" aria-hidden="true"></span>
		<Button variant="icon" icon="undo" label="Undo" disabled={!canUndo} onclick={onundo} />
		<Button variant="icon" icon="redo" label="Redo" disabled={!canRedo} onclick={onredo} />
		{#if onlayout}
			<span class="divider" aria-hidden="true"></span>
			<ActionMenu
				label="Layout"
				icon="layout"
				items={TABLE_LAYOUTS}
				side={menuSide}
				scope={scopes.selection ? { label: 'Lay out', value: scope, choices: [{ value: 'selection', label: scopes.label }, { value: 'table', label: 'The whole table' }] } : undefined}
				onscope={(value) => (wanted = value as LayoutScope)}
				toggle={onautolayout ? { label: 'Auto layout', detail: 'Again whenever something is added', checked: !!autoLayout } : undefined}
				ontoggle={auto}
				current={autoLayout}
				pressed={!!autoLayout}
				onaction={layOut}
			/>
		{/if}
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

	.media {
		display: none;
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

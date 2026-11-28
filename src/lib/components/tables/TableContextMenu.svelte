<script lang="ts">
	import { contextItems, toolChoice, type LayoutScope, type TableContextState } from '$lib/table-menus';
	import type { TablePostAs } from '$lib/table-post';
	import ContextMenu from '../ui/ContextMenu.svelte';

	interface Props {
		/** The table as the menu needs to know it; what it leaves out isn't offered (`contextItems`). */
		state: TableContextState;
		ontool?: (tool: string, geo?: string) => void;
		onmedia?: (files: File[]) => void;
		onlayout?: (layout: string, scope: LayoutScope) => void;
		onautolayout?: (layout: string | null) => void;
		onadd?: () => void;
		ondetails?: (shown: boolean) => void;
		ontags?: () => void;
		onundo?: () => void;
		onredo?: () => void;
		onfit?: () => void;
		onvoice?: () => void;
		onvoicechoice?: (choice: 'correct' | 'arrange' | 'commands', on: boolean) => void;
		onpost?: (as: TablePostAs) => void;
		onpublish?: (published: boolean) => void;
	}

	let { state: table, ontool, onmedia, onlayout, onautolayout, onadd, ondetails, ontags, onundo, onredo, onfit, onvoice, onvoicechoice, onpost, onpublish }: Props = $props();

	let menu = $state<ContextMenu>();
	let picker = $state<HTMLInputElement>();
	const items = $derived(contextItems(table));
	const title = $derived(table.selection.length ? `${table.selection.length} selected` : 'Table');

	/** Opens the menu at a point in the viewport, such as where the canvas was right-clicked. */
	export function openAt(point: { x: number; y: number }) {
		return menu?.openAt(point);
	}

	function act(value: string) {
		const [kind, ...rest] = value.split(':');
		const arg = rest.join(':');
		if (kind === 'layout') {
			const scope = rest[0] as LayoutScope;
			const layout = rest.slice(1).join(':');
			onlayout?.(layout, scope);
			// As on the toolbar: a layout chosen for the whole table while auto layout is on is the one kept.
			if (scope === 'table' && table.autoLayout) onautolayout?.(layout);
		} else if (kind === 'auto') {
			onautolayout?.(table.autoLayout ? null : 'auto');
			if (!table.autoLayout) onlayout?.('auto', 'table');
		} else if (kind === 'tool') ontool?.(arg);
		else if (kind === 'more') {
			if (arg === 'media') return picker?.click();
			const choice = toolChoice(arg);
			if (choice) ontool?.(choice.tool, choice.geo);
		} else if (kind === 'voice') {
			if (!arg) onvoice?.();
			else if (table.voice) onvoicechoice?.(arg as 'correct' | 'arrange' | 'commands', !table.voice[arg as 'correct' | 'arrange' | 'commands']);
		} else if (kind === 'post') onpost?.(arg as TablePostAs);
		else if (kind === 'publish') onpublish?.(!table.published);
		else if (kind === 'details') ondetails?.(table.details !== 'shown');
		else if (kind === 'add') onadd?.();
		else if (kind === 'tags') ontags?.();
		else if (kind === 'undo') onundo?.();
		else if (kind === 'redo') onredo?.();
		else if (kind === 'fit') onfit?.();
	}
</script>

<!--
	The table canvas's right-click menu: what the toolbar does, where the pointer is. What applies
	to the selection comes first, then layouts for the whole table, the tools, voice, and the rest.
-->
<ContextMenu bind:this={menu} {title} {items} onAction={act} />
{#if onmedia}
	<input bind:this={picker} class="media" type="file" accept="image/*,video/*" multiple tabindex="-1" aria-hidden="true" onchange={() => { if (!picker) return; onmedia([...(picker.files ?? [])]); picker.value = ''; }} />
{/if}

<style>
	.media {
		display: none;
	}
</style>

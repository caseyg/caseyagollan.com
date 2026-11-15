<script lang="ts" module>
	export interface CommandOption {
		/** Unique; passed to `onAction`. */
		value: string;
		label: string;
		/** An emoji, drawn in a tile. */
		icon?: string;
		/** A short line under the label, such as a search result's excerpt. */
		hint?: string;
		count?: number;
		/** More words that find the command, such as synonyms. */
		keywords?: string[];
		/**
		 * The page this command goes to. A plain click still runs `onAction`; ⌘/Ctrl-click, Shift-click,
		 * a middle click or ⌘/Ctrl-Enter opens it in a new tab and leaves the palette open.
		 */
		href?: string;
		/** Leaves the site; marked ↗. */
		external?: boolean;
		/** Shown whatever is typed, such as search results that were matched elsewhere. */
		always?: boolean;
		/** Commands on a page of their own, opened by choosing this one. Backspace in the empty field goes back. */
		items?: CommandOption[];
	}

	export interface CommandSection {
		label?: string;
		items: CommandOption[];
	}
</script>

<script lang="ts">
	import { Command, CommandEmpty, CommandGroup, CommandGroupLabel, CommandInput, CommandItem, CommandItemIcon, CommandItemText, CommandList, CommandPage, CommandStatus } from '@ui-sdk/svelte/command';
	import { Dialog, DialogBackdrop, DialogContent, DialogTitle } from '@ui-sdk/svelte/dialog';
	import { useShortcut, useShortcutHint } from '@ui-sdk/svelte/shortcuts';
	import { fuzzyScore } from '@ui-sdk/core/text-match';
	import Count from './Count.svelte';
	import Icon from './Icon.svelte';

	interface Props {
		/** Commands, in the order shown. Typing filters them, matching letters in order. */
		sections: CommandSection[];
		/** Runs the chosen command. The palette closes after. */
		onAction: (value: string) => unknown;
		open?: boolean;
		/** The search text, for callers that add results as it changes. */
		query?: string;
		/** Names the dialog and the search field. */
		label?: string;
		placeholder?: string;
		/** Opens the palette from anywhere on the page, even while typing. `null` for none. */
		shortcut?: string | null;
		/** A status line under the field, such as "Searching…". */
		status?: string;
	}

	let { sections, onAction, open = $bindable(false), query = $bindable(''), label = 'Command palette', placeholder = 'Go to, write, or search…', shortcut = 'mod+k', status = '' }: Props = $props();

	useShortcut(() => shortcut, () => (open = true), { description: label });
	const hint = useShortcutHint(() => shortcut ?? '');

	const pages = $derived(sections.flatMap((section) => section.items.filter((item) => item.items?.length)));

	// The default fuzzy match, except that `always` commands stay listed, after the ones that match.
	const always = $derived(new Set(sections.flatMap((section) => section.items.filter((item) => item.always).map((item) => item.value))));
	function filter(item: { value: string; label: string; keywords?: string[] }, text: string) {
		if (always.has(item.value)) return 0.001;
		return Math.max(fuzzyScore(item.label, text), ...(item.keywords ?? []).map((word) => fuzzyScore(word, text) * 0.9));
	}

	const links = $derived(new Map(sections.flatMap((section) => section.items.flatMap((item) => [item, ...(item.items ?? [])])).filter((item) => item.href).map((item) => [item.value, item.href!])));

	/** A click or key press that asks for a new tab rather than this one. */
	const wantsNewTab = (event?: Event) => (event instanceof MouseEvent || event instanceof KeyboardEvent) && (event.metaKey || event.ctrlKey || event.shiftKey);

	async function run(value: string, details?: { event?: Event }) {
		if (pages.some((page) => page.value === value)) return;
		const href = links.get(value);
		// ⌘/Ctrl-Enter on a link. (Clicks on one go to its own anchor, which the browser opens itself.)
		if (href && wantsNewTab(details?.event)) {
			window.open(href, '_blank', 'noopener');
			return;
		}
		await onAction(value);
		open = false;
	}

	/**
	 * A link command covers itself with a real anchor, so the browser does what it does for any link:
	 * ⌘-click opens a background tab, a middle click too, and the context menu offers to copy it.
	 * A plain click becomes the command's own action, which closes the palette.
	 */
	function linkClick(event: MouseEvent) {
		if (event.button !== 0 || wantsNewTab(event) || event.altKey) {
			event.stopPropagation();
			return;
		}
		event.preventDefault();
	}

	// The dialog hides the page's overflow, but iOS still scrolls the page under a finger.
	// While open, a drag moves only the list, and only while the list has somewhere to go.
	$effect(() => {
		if (!open) return;
		let lastY = 0;
		const onStart = (event: TouchEvent) => (lastY = event.touches[0]?.clientY ?? 0);
		function onMove(event: TouchEvent) {
			const y = event.touches[0]?.clientY ?? lastY;
			const dy = y - lastY;
			lastY = y;
			const list = event.target instanceof Element ? event.target.closest<HTMLElement>('.command-list') : null;
			const canScroll = list && (dy > 0 ? list.scrollTop > 0 : list.scrollTop + list.clientHeight < list.scrollHeight - 1);
			if (!canScroll && event.cancelable) event.preventDefault();
		}
		window.addEventListener('touchstart', onStart, { passive: true });
		window.addEventListener('touchmove', onMove, { passive: false });
		return () => {
			window.removeEventListener('touchstart', onStart);
			window.removeEventListener('touchmove', onMove);
		};
	});

	// Every palette opens empty, on its first page.
	$effect(() => {
		if (!open) query = '';
	});
</script>

{#snippet option(item: CommandOption)}
	<CommandItem class="command-item" value={item.value} label={item.label} keywords={item.keywords} page={item.items?.length ? item.value : undefined}>
		{#if item.icon}<CommandItemIcon class="command-item-icon">{item.icon}</CommandItemIcon>{/if}
		<span class="command-item-text">
			<span class="command-item-title">
				<CommandItemText class="command-item-label">{item.label}</CommandItemText>
				{#if item.external}<span class="command-item-external" aria-hidden="true">↗</span><span class="visually-hidden">(on another site)</span>{/if}
			</span>
			{#if item.hint}<span class="command-item-hint">{item.hint}</span>{/if}
		</span>
		{#if item.count !== undefined}<Count value={item.count} />{/if}
		{#if item.items?.length}<span class="command-item-more" aria-hidden="true">›</span>{/if}
		{#if item.href}<a class="command-item-link" href={item.href} tabindex="-1" aria-hidden="true" onclick={linkClick} onauxclick={(event) => event.stopPropagation()}></a>{/if}
	</CommandItem>
{/snippet}

<Dialog bind:open>
	<DialogBackdrop class="command-backdrop" />
	<DialogContent class="command-palette">
		<DialogTitle class="visually-hidden">{label}</DialogTitle>
		<Command class="command" bind:query onAction={run} {filter} loop>
			<div class="command-field">
				<Icon name="search" size={18} />
				<CommandInput class="command-input" aria-label={label} {placeholder} />
				{#if hint.text}<kbd class="command-kbd" aria-hidden="true">{hint.text}</kbd>{/if}
			</div>
			{#if status}<CommandStatus class="command-status">{status}</CommandStatus>{/if}
			<CommandEmpty class="command-empty">Nothing matches “{query}”.</CommandEmpty>
			<CommandList class="command-list">
				<CommandPage>
					{#each sections as section, i (section.label ?? i)}
						{#if section.items.length}
							<CommandGroup class="command-group">
								{#if section.label}<CommandGroupLabel class="command-group-label">{section.label}</CommandGroupLabel>{/if}
								{#each section.items as item (item.value)}{@render option(item)}{/each}
							</CommandGroup>
						{/if}
					{/each}
				</CommandPage>
				{#each pages as page (page.value)}
					<CommandPage value={page.value}>
						<CommandGroup class="command-group">
							<CommandGroupLabel class="command-group-label">{page.label}</CommandGroupLabel>
							{#each page.items ?? [] as item (item.value)}{@render option(item)}{/each}
						</CommandGroup>
					</CommandPage>
				{/each}
			</CommandList>
		</Command>
	</DialogContent>
</Dialog>

<style>
	:global(.command-backdrop) {
		position: fixed;
		inset: 0;
		background: rgb(0 0 0 / 0.35);
		/* iOS Safari draws its toolbars over the page, past the bottom of a fixed box; the shadow dims there too. */
		box-shadow: 0 0 0 100vmax rgb(0 0 0 / 0.35);
		touch-action: none;
		transition: opacity 150ms var(--ease-out);
	}

	:global(.command-backdrop:is([data-starting-style], [data-ending-style])) {
		opacity: 0;
	}

	:global(.command-palette) {
		position: fixed;
		top: max(var(--space-4), 12vh);
		left: 50%;
		box-sizing: border-box;
		width: min(36rem, calc(100vw - 2 * var(--space-4)));
		max-height: min(32rem, calc(var(--visual-viewport-height, 100dvh) - 12vh - var(--space-4)));
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--bg-primary);
		color: var(--text-primary);
		box-shadow: 0 1rem 3rem rgb(0 0 0 / 0.35);
		translate: -50% 0;
		transition: opacity 150ms var(--ease-out), scale 150ms var(--ease-out);
	}

	:global(.command-palette:is([data-starting-style], [data-ending-style])) {
		opacity: 0;
		scale: 0.97;
	}

	:global(.command) {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-height: 0;
	}

	.command-field {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4);
		border-bottom: 1px solid var(--border-subtle);
		color: var(--text-secondary);
	}

	:global(.command-input) {
		flex: 1;
		min-width: 0;
		padding: var(--space-1) 0;
		border: 0;
		background: none;
		color: var(--text-primary);
		font: inherit;
		font-size: var(--fs-md);
		outline: none;
	}

	:global(.command-input::placeholder) {
		color: var(--text-muted);
	}

	.command-kbd {
		padding: 0.125rem 0.375rem;
		border-radius: var(--radius-sm);
		background: var(--surface-2);
		color: var(--text-secondary);
		font: inherit;
		font-size: var(--fs-xs);
	}

	:global(.command-status),
	:global(.command-empty) {
		padding: var(--space-3) var(--space-4);
		color: var(--text-secondary);
		font-size: var(--fs-sm);
	}

	:global(.command-status) {
		padding-bottom: 0;
	}

	:global(.command-empty:not([data-empty])) {
		display: none;
	}

	:global(.command-list) {
		flex: 1;
		min-height: 0;
		padding: var(--space-1);
		overflow-y: auto;
		overscroll-behavior: contain;
		touch-action: pan-y;
		scroll-padding: var(--space-2);
		scrollbar-width: thin;
	}

	:global(.command-list:empty) {
		display: none;
	}

	:global(.command-group-label) {
		padding: var(--space-3) var(--space-2) var(--space-1);
		color: var(--text-secondary);
		font-size: var(--fs-xs);
		letter-spacing: var(--tracking-wide);
		text-transform: uppercase;
	}

	:global(.command-item) {
		position: relative;
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2);
		border-radius: var(--radius-sm);
		font-size: var(--fs-sm);
		line-height: var(--lh-snug);
		cursor: pointer;
		transition: background var(--duration) var(--ease);
	}

	/* Covers the whole command, so every part of it is the link. */
	.command-item-link {
		position: absolute;
		inset: 0;
		border-radius: inherit;
	}

	:global(.command-item[data-highlighted]) {
		background: var(--surface-2);
	}

	:global(.command-item[data-disabled]) {
		opacity: 0.5;
		cursor: default;
	}

	:global(.command-item-icon) {
		display: grid;
		place-items: center;
		flex: none;
		width: 1.75rem;
		height: 1.75rem;
		border-radius: var(--radius-sm);
		background: var(--surface-1);
		font-size: var(--fs-base);
	}

	.command-item-text {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
	}

	:global(.command-item-label) {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	:global(.command-item-label mark) {
		background: none;
		color: inherit;
		font-weight: var(--fw-semibold);
		text-decoration: underline;
		text-underline-offset: var(--underline-offset);
	}

	.command-item-title {
		display: flex;
		gap: var(--space-1);
		min-width: 0;
	}

	.command-item-external {
		flex: none;
		color: var(--text-secondary);
	}

	.command-item-hint {
		overflow: hidden;
		color: var(--text-secondary);
		font-size: var(--fs-xs);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.command-item-more {
		color: var(--text-secondary);
	}

	/* No keyboard to press it on, on a touch screen. */
	@media (hover: none) and (pointer: coarse) {
		.command-kbd {
			display: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		:global(.command-palette),
		:global(.command-backdrop) {
			transition: none;
		}
	}
</style>

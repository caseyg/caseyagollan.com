<script lang="ts">
	import { SegmentedPill, Button, TextField } from '$lib/components/ui';
	import { sanitizeCaption, type Figure, type FigureAlign } from '$lib/markdown-figure';

	interface Props {
		figure: Figure;
		/** Shows the figure's controls: placement, alt text and remove. */
		selected?: boolean;
		/** Called with the fields that changed. */
		onchange?: (changes: Partial<Figure>) => void;
		onremove?: () => void;
		/** Called when the image is clicked, to select the figure. */
		onselect?: () => void;
	}

	let { figure, selected = false, onchange, onremove, onselect }: Props = $props();

	let editingAlt = $state(false);
	let caption: HTMLElement | undefined = $state();

	const placements: { align: FigureAlign; label: string; title: string }[] = [
		{ align: 'full', label: 'Full', title: 'Full width' },
		{ align: 'right', label: 'Right', title: 'Beside the text' },
		{ align: 'narrow', label: 'Narrow', title: 'Beside the text, narrow, for phone screenshots' }
	];
	const segments = placements.map(({ align, label, title }) => ({ label, title, value: align }));

	// The caption is edited in place. Write its HTML only when it changed from outside,
	// so typing never resets the cursor.
	$effect(() => {
		if (caption && sanitizeCaption(caption) !== figure.caption) caption.innerHTML = figure.caption;
	});

	function captionInput() {
		if (!caption) return;
		const next = sanitizeCaption(caption);
		if (next !== figure.caption) onchange?.({ caption: next });
	}

	function captionKeydown(event: KeyboardEvent) {
		// A caption is one line; keep keys from reaching the surrounding editor.
		event.stopPropagation();
		if (event.key === 'Enter' || event.key === 'Escape') {
			event.preventDefault();
			caption?.blur();
		}
	}

	function captionPaste(event: ClipboardEvent) {
		event.preventDefault();
		event.stopPropagation();
		document.execCommand('insertText', false, event.clipboardData?.getData('text/plain').replace(/\s+/g, ' ') ?? '');
	}
</script>

<figure class="editable-figure" class:align-right={figure.align !== 'full'} class:narrow={figure.align === 'narrow'} class:selected>
	{#if selected}
		<div class="controls" role="toolbar" aria-label="Figure">
			<SegmentedPill size="sm" label="Placement" {segments} value={figure.align} onValueChange={(align) => onchange?.({ align: align as FigureAlign })} />
			<Button size="sm" variant="quiet" aria-pressed={editingAlt} onclick={() => (editingAlt = !editingAlt)}>Alt text</Button>
			<Button size="sm" variant="quiet" onclick={() => onremove?.()}>Remove</Button>
		</div>
	{/if}
	<button type="button" class="image" aria-label="Select figure" onclick={() => onselect?.()}>
		<img src={figure.src} alt={figure.alt} />
	</button>
	{#if selected && editingAlt}
		<div class="alt">
			<TextField label="Alt text" multiline rows={3} value={figure.alt} oninput={(event: Event) => onchange?.({ alt: (event.currentTarget as HTMLTextAreaElement).value })} onkeydown={(event: KeyboardEvent) => event.stopPropagation()} />
		</div>
	{/if}
	<figcaption
		bind:this={caption}
		contenteditable="true"
		aria-label="Caption"
		data-placeholder="Add a caption"
		oninput={captionInput}
		onkeydown={captionKeydown}
		onpaste={captionPaste}
	></figcaption>
</figure>

<style>
	.editable-figure {
		position: relative;
		/* A column, so the whitespace around the optional parts never adds a line. */
		display: flex;
		flex-direction: column;
	}

	.image {
		display: block;
		width: 100%;
		/* Still selectable while the image loads or if it is missing. */
		min-height: 2.5rem;
		padding: 0;
		border: 0;
		background: none;
		cursor: pointer;
	}

	.image img {
		max-width: 100%;
	}

	.editable-figure.selected .image img {
		outline: 2px solid var(--text-primary);
		outline-offset: 2px;
	}

	.controls {
		position: absolute;
		bottom: 100%;
		right: 0;
		z-index: var(--z-menu);
		display: flex;
		align-items: center;
		gap: var(--space-1);
		width: max-content;
		margin-bottom: var(--space-2);
		padding: var(--space-1);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg-primary);
		font-size: var(--fs-sm);
	}

	.alt {
		margin-top: var(--space-2);
		font-size: var(--fs-sm);
	}

	figcaption {
		min-height: 1lh;
		outline: 0;
		cursor: text;
	}

	figcaption:empty::before {
		content: attr(data-placeholder);
		color: var(--text-muted);
	}

	.editable-figure:not(.selected) figcaption:empty:not(:focus) {
		display: none;
	}

	figcaption:focus-visible {
		box-shadow: 0 1px 0 var(--border-strong);
	}
</style>

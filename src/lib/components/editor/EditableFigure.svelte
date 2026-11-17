<script lang="ts">
	import { SegmentedPill, Button, TextField } from '$lib/components/ui';
	import { sanitizeCaption, type Figure, type FigureAlign } from '$lib/markdown-figure';

	interface Props {
		figure: Figure;
		/**
		 * `figure` is a captioned figure block with a placement. `image` is a Markdown
		 * image: alt text only, no caption. `photo` is a photo attached to the post,
		 * whose alt text shows beneath it as it does on the post, and is edited there.
		 */
		variant?: 'figure' | 'image' | 'photo';
		/** Shows the figure's controls: placement, alt text and remove. */
		selected?: boolean;
		/** Called with the fields that changed. */
		onchange?: (changes: Partial<Figure>) => void;
		onremove?: () => void;
		/** Called when the image is clicked, to select the figure. */
		onselect?: () => void;
	}

	let { figure, variant = 'figure', selected = false, onchange, onremove, onselect }: Props = $props();

	let editingAlt = $state(false);
	let caption: HTMLElement | undefined = $state();

	const placements: { align: FigureAlign; label: string; title: string }[] = [
		{ align: 'full', label: 'Full', title: 'Full width' },
		{ align: 'right', label: 'Right', title: 'Beside the text' },
		{ align: 'narrow', label: 'Narrow', title: 'Beside the text, narrow, for phone screenshots' }
	];
	const segments = placements.map(({ align, label, title }) => ({ label, title, value: align }));

	const photo = $derived(variant === 'photo');
	// A photo's alt text is plain text; a figure's caption is HTML.
	const read = (element: HTMLElement) => (photo ? (element.textContent ?? '').replace(/\s+/g, ' ') : sanitizeCaption(element));
	const stored = $derived(photo ? figure.alt : figure.caption);

	// The caption is edited in place. Write it only when it changed from outside,
	// so typing never resets the cursor.
	$effect(() => {
		if (!caption || read(caption).trim() === stored.trim()) return;
		if (photo) caption.textContent = stored;
		else caption.innerHTML = stored;
	});

	function captionInput() {
		if (!caption) return;
		const next = read(caption);
		if (next !== stored) onchange?.(photo ? { alt: next } : { caption: next });
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

<figure class="editable-figure {variant}" class:align-right={variant === 'figure' && figure.align !== 'full'} class:narrow={variant === 'figure' && figure.align === 'narrow'} class:selected>
	{#if selected && !photo}
		<div class="controls" role="toolbar" aria-label={variant === 'image' ? 'Image' : 'Figure'}>
			{#if variant === 'figure'}<SegmentedPill size="sm" label="Placement" {segments} value={figure.align} onValueChange={(align) => onchange?.({ align: align as FigureAlign })} />{/if}
			<Button size="sm" variant="quiet" aria-pressed={editingAlt} onclick={() => (editingAlt = !editingAlt)}>Alt text</Button>
			<Button size="sm" variant="quiet" onclick={() => onremove?.()}>Remove</Button>
		</div>
	{/if}
	{#if photo}
		<img class="photo-image" src={figure.src} alt={figure.alt} />
	{:else}
		<button type="button" class="image" aria-label={variant === 'image' ? 'Select image' : 'Select figure'} onclick={() => onselect?.()}>
			<img src={figure.src} alt={figure.alt} />
		</button>
	{/if}
	{#if selected && editingAlt && !photo}
		<div class="alt">
			<TextField label="Alt text" multiline rows={3} value={figure.alt} oninput={(event: Event) => onchange?.({ alt: (event.currentTarget as HTMLTextAreaElement).value })} onkeydown={(event: KeyboardEvent) => event.stopPropagation()} />
		</div>
	{/if}
	{#if variant !== 'image'}
		<figcaption
			bind:this={caption}
			contenteditable={photo ? 'plaintext-only' : 'true'}
			role={photo ? 'textbox' : undefined}
			aria-label={photo ? 'Alt text' : 'Caption'}
			data-placeholder={photo ? 'Add alt text' : 'Add a caption'}
			oninput={captionInput}
			onkeydown={captionKeydown}
			onpaste={captionPaste}
		></figcaption>
	{/if}
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

	.image img,
	.photo-image {
		max-width: 100%;
	}

	/* Attached photos sit as they do on the post, with their alt text beneath. */
	.photo-image {
		display: block;
		height: auto;
		border-radius: var(--radius-sm);
	}

	.photo figcaption {
		margin-top: var(--space-2);
		padding: var(--space-1) 0;
		border-bottom: 1px solid transparent;
		color: var(--text-muted);
		font-size: var(--fs-sm);
		line-height: var(--lh-snug);
	}

	.photo figcaption:hover {
		border-bottom-color: var(--border);
	}

	.photo figcaption:focus {
		border-bottom-color: var(--border-strong);
		color: var(--text-primary);
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

	.editable-figure.figure:not(.selected) figcaption:empty:not(:focus) {
		display: none;
	}

	.figure figcaption:focus-visible {
		box-shadow: 0 1px 0 var(--border-strong);
	}
</style>

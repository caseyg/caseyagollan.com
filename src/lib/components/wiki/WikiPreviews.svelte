<script lang="ts">
	import { onMount } from 'svelte';
	import { HoverCard, HoverCardContent, createHoverCardController, type HoverCardContentState } from '@ui-sdk/svelte/hover-card';
	import { loadPreview, previewSlug, type WikiPreview } from '$lib/wiki/preview';

	interface Props {
		/** Links inside these get previews. Prose covers post bodies and wiki pages. */
		scope?: string;
		/** How long the pointer or focus rests on a link before its preview opens. */
		delay?: number;
	}

	let { scope = '.prose, [data-wiki-previews]', delay = 500 }: Props = $props();

	const card = createHoverCardController<WikiPreview>();
	let opening: ReturnType<typeof setTimeout> | undefined;
	let closing: ReturnType<typeof setTimeout> | undefined;
	let current: HTMLAnchorElement | null = null;

	const inCard = (target: EventTarget | null) => target instanceof Element && !!target.closest('.wiki-preview');

	function linkFrom(target: EventTarget | null): HTMLAnchorElement | null {
		if (!(target instanceof Element) || inCard(target)) return null;
		const link = target.closest<HTMLAnchorElement>('a[href]');
		if (!link || !link.closest(scope) || link.closest('nav')) return null;
		return previewSlug(link) ? link : null;
	}

	function show(link: HTMLAnchorElement) {
		clearTimeout(closing);
		if (current === link) return;
		clearTimeout(opening);
		current = link;
		opening = setTimeout(async () => {
			const preview = await loadPreview(previewSlug(link)!);
			// The pointer may have moved on while it loaded.
			if (preview && current === link && link.isConnected) void card.open({ payload: preview, anchor: link });
		}, delay);
	}

	function hide() {
		clearTimeout(opening);
		clearTimeout(closing);
		closing = setTimeout(() => {
			current = null;
			card.close();
		}, 250);
	}

	onMount(() => {
		// Touch has no hover: a tap follows the link, and the page it opens has everything the card would.
		const hover = matchMedia('(hover: hover) and (pointer: fine)');
		const over = (event: PointerEvent) => {
			if (!hover.matches) return;
			if (inCard(event.target)) return clearTimeout(closing);
			const link = linkFrom(event.target);
			if (link) show(link);
			else if (current) hide();
		};
		const focus = (event: FocusEvent) => {
			const link = linkFrom(event.target);
			if (link && (event.target as Element).matches(':focus-visible')) show(link);
		};
		const blur = (event: FocusEvent) => {
			if (current && !inCard(event.relatedTarget)) hide();
		};
		const press = () => {
			clearTimeout(opening);
			current = null;
		};
		document.addEventListener('pointerover', over);
		document.addEventListener('focusin', focus);
		document.addEventListener('focusout', blur);
		document.addEventListener('pointerdown', press);
		return () => {
			document.removeEventListener('pointerover', over);
			document.removeEventListener('focusin', focus);
			document.removeEventListener('focusout', blur);
			document.removeEventListener('pointerdown', press);
			clearTimeout(opening);
			clearTimeout(closing);
		};
	});
</script>

<HoverCard controller={card} onOpenChange={(open) => { if (!open) current = null; }}>
	<HoverCardContent class="wiki-preview" side="bottom" align="start" sideOffset={6} collisionPadding={12}>
		{#snippet children(state: HoverCardContentState<WikiPreview>)}
			{#if state.payload}
				<a class="title" href="/wiki/{state.payload.slug}"><span aria-hidden="true">📓</span> {state.payload.title}</a>
				<div class="body prose-preview">{@html state.payload.html}</div>
			{/if}
		{/snippet}
	</HoverCardContent>
</HoverCard>

<style>
	:global(.wiki-preview) {
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		width: min(24rem, calc(100vw - 2 * var(--space-4)));
		max-height: min(20rem, var(--available-height));
		margin: 0;
		padding: var(--space-3) var(--space-4);
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg-primary);
		color: var(--text-primary);
		font-size: var(--fs-sm);
		line-height: var(--lh-normal);
		box-shadow: 0 0.75rem 2rem rgb(0 0 0 / 0.3);
		transform-origin: var(--transform-origin);
		transition: opacity 150ms var(--ease-out), scale 150ms var(--ease-out);
	}

	:global(.wiki-preview[data-starting-style]),
	:global(.wiki-preview[data-ending-style]) {
		opacity: 0;
		scale: 0.97;
	}

	.title {
		flex: none;
		color: var(--text-primary);
		font-weight: var(--fw-semibold);
		text-decoration: none;
	}

	.title:hover {
		text-decoration: underline;
		text-underline-offset: var(--underline-offset);
	}

	/* The top of the page, faded where it is cut off. */
	.body {
		min-height: 0;
		overflow: hidden;
		color: var(--text-secondary);
		mask-image: linear-gradient(to bottom, black 70%, transparent);
	}

	.body :global(:is(p, ul, ol, blockquote)) {
		margin: 0 0 0.6em;
	}

	.body :global(:is(ul, ol)) {
		padding-left: 1.2em;
	}

	.body :global(:is(h1, h2, h3, h4)) {
		margin: 0.6em 0 0.3em;
		font-size: 1em;
		font-weight: var(--fw-semibold);
	}

	.body :global(img) {
		max-width: 100%;
		height: auto;
		border-radius: var(--radius-sm);
	}

	.body :global(a) {
		color: inherit;
	}

	@media (prefers-reduced-motion: reduce) {
		:global(.wiki-preview) {
			transition: none;
		}
	}
</style>

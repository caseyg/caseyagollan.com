<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** `start` is the top-left corner, for where you are; `end` is the top-right, for where you can go. */
		side?: 'start' | 'end';
		/** On a phone: stay `pinned`, drop back `inline` into the page, or be `hidden`. */
		phone?: 'pinned' | 'inline' | 'hidden';
		as?: 'div' | 'nav';
		class?: string;
		children: Snippet;
		/**
		 * At the `end` side: set when the corner's contents, at full width, would not leave the
		 * `start` corner room for its title. The caller then shows a condensed version.
		 */
		crowded?: boolean;
		[key: string]: unknown;
	}

	let { side = 'start', phone = 'pinned', as = 'div', class: className = '', children, crowded = $bindable(false), ...rest }: Props = $props();

	/** The narrowest gap between the two corners that still holds a date pill with room to breathe. */
	const DATE_ROOM = 128;
	/** How much of a trail's titles stays readable before the other corner condenses: a word or two. */
	const TITLE_ROOM = 96;
	/** Corners tell each other when they change size, so the `end` one can decide whether it fits. */
	const EVENT = 'corner-resize';

	/*
	 * The room the `start` corner asks for: its width with nothing cut short, less what its titles
	 * can give up by ending in an ellipsis, keeping `TITLE_ROOM` of them. It is measured with the
	 * corner's cap lifted for the moment, since controls that can't shrink, such as the library's,
	 * would otherwise be measured as already squeezed and leave the other corner on top of them.
	 */
	function startNeed(node: HTMLElement) {
		const cap = node.style.maxWidth;
		node.style.maxWidth = 'none';
		const width = node.offsetWidth;
		const titles = [...node.querySelectorAll<HTMLElement>('.segment > .text')].reduce((sum, title) => sum + title.offsetWidth, 0);
		node.style.maxWidth = cap;
		return width - titles + Math.min(titles, TITLE_ROOM);
	}

	/*
	 * Tell the page how wide each corner is, as `--corner-start` and `--corner-end` on the root, and
	 * whether a date fits in the gap between them (`data-bar-room`). On a phone the feed's sticky
	 * date uses these to sit in the bar itself, between the two groups.
	 */
	function measure(node: HTMLElement) {
		const root = document.documentElement;
		const name = `--corner-${side}`;
		const width = (corner: string) => parseFloat(root.style.getPropertyValue(`--corner-${corner}`)) || 0;
		const inset = () => parseFloat(getComputedStyle(node).top) || 0;
		// Every change to <html>'s style restyles the whole page, so write a value only when it changed.
		const set = (property: string, value: string) => {
			if (root.style.getPropertyValue(property) !== value) root.style.setProperty(property, value);
		};
		// The end corner's width with everything in it, remembered while it is condensed.
		let fullWidth = 0;
		const fit = () => {
			if (side !== 'end' || getComputedStyle(node).position !== 'fixed') return;
			if (!crowded) fullWidth = node.offsetWidth;
			const start = width('start-need');
			const next = start > 0 && fullWidth + start + 3 * inset() > root.clientWidth;
			if (next !== crowded) crowded = next;
		};
		const measureNow = () => {
			frame = 0;
			if (!node.isConnected) return;
			const pinned = getComputedStyle(node).position === 'fixed';
			set(name, `${pinned ? node.offsetWidth : 0}px`);
			if (side === 'start') {
				const need = `${pinned ? startNeed(node) : 0}px`;
				if (root.style.getPropertyValue('--corner-start-need') !== need) {
					set('--corner-start-need', need);
					window.dispatchEvent(new Event(EVENT));
				}
			} else {
				fit();
			}
			const gap = root.clientWidth - width('start') - width('end') - 2 * inset();
			if (root.hasAttribute('data-bar-room') !== gap >= DATE_ROOM) root.toggleAttribute('data-bar-room', gap >= DATE_ROOM);
		};
		// Measuring makes the browser lay the page out, and while a page hydrates or a menu fills, its
		// contents change many times a frame. Measure once, in the next frame, however many changes came.
		// A resize is reported once a frame, after layout, so it's measured at once.
		let frame = 0;
		const update = () => { frame ||= requestAnimationFrame(measureNow); };
		const observer = new ResizeObserver(() => { cancelAnimationFrame(frame); measureNow(); });
		observer.observe(node);
		// Held at its cap, the start corner keeps its size while what it holds grows, so watch that too.
		const contents = new MutationObserver(update);
		if (side === 'start') contents.observe(node, { childList: true, subtree: true, characterData: true });
		window.addEventListener('resize', update);
		if (side === 'end') window.addEventListener(EVENT, fit);
		// No first measure here: this runs while the page hydrates, so measuring now lays out a half-built
		// page. The observer reports the corner's size once layout is done, before the first frame is drawn.
		return {
			destroy() {
				cancelAnimationFrame(frame);
				observer.disconnect();
				contents.disconnect();
				window.removeEventListener('resize', update);
				window.removeEventListener(EVENT, fit);
				root.style.removeProperty(name);
				if (side === 'start') {
					root.style.removeProperty('--corner-start-need');
					window.dispatchEvent(new Event(EVENT));
				}
			}
		};
	}
</script>

<!-- Controls pinned to a top corner of the viewport, staying put while the page scrolls. -->
<svelte:element this={as} class="corner corner--{side} corner--phone-{phone} {className}" {...rest} use:measure>
	{@render children()}
</svelte:element>

<style>
	.corner {
		position: fixed;
		top: var(--nav-inset);
		z-index: var(--z-nav);
		display: flex;
		align-items: flex-start;
		gap: var(--nav-inset);
	}

	/* The where-you-are corner gives way to the other one: its titles end in an ellipsis instead. */
	.corner--start {
		left: var(--nav-inset);
		max-width: calc(100% - var(--corner-end, 0px) - 3 * var(--nav-inset));
	}

	.corner--start > :global(*) {
		min-width: 0;
	}

	.corner--end {
		right: var(--nav-inset);
	}

	@media (max-width: 600px) {
		.corner--phone-inline {
			position: static;
			z-index: auto;
		}

		.corner--phone-hidden {
			display: none;
		}
	}
</style>

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
		[key: string]: unknown;
	}

	let { side = 'start', phone = 'pinned', as = 'div', class: className = '', children, ...rest }: Props = $props();

	/** The narrowest gap between the two corners that still holds a date pill with room to breathe. */
	const DATE_ROOM = 128;

	/*
	 * Tell the page how wide each corner is, as `--corner-start` and `--corner-end` on the root, and
	 * whether a date fits in the gap between them (`data-bar-room`). On a phone the feed's sticky
	 * date uses these to sit in the bar itself, between the two groups.
	 */
	function measure(node: HTMLElement) {
		const root = document.documentElement;
		const name = `--corner-${side}`;
		const update = () => {
			const pinned = getComputedStyle(node).position === 'fixed';
			root.style.setProperty(name, `${pinned ? node.offsetWidth : 0}px`);
			const width = (corner: string) => parseFloat(root.style.getPropertyValue(`--corner-${corner}`)) || 0;
			const inset = parseFloat(getComputedStyle(node).top) || 0;
			const gap = root.clientWidth - width('start') - width('end') - 2 * inset;
			root.toggleAttribute('data-bar-room', gap >= DATE_ROOM);
		};
		const observer = new ResizeObserver(update);
		observer.observe(node);
		window.addEventListener('resize', update);
		update();
		return {
			destroy() {
				observer.disconnect();
				window.removeEventListener('resize', update);
				root.style.removeProperty(name);
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

	.corner--start {
		left: var(--nav-inset);
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

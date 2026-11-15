<script lang="ts" module>
	/** Where a page's screenshot is: still coming, failed, or ready at `image`. */
	export type LinkPreviewImage = 'loading' | 'error' | { src: string };

	/** Host and the start of the path, as a short, readable address. */
	export function displayUrl(url: string, maxPath = 30): string {
		try {
			const { hostname, pathname } = new URL(url);
			const path = pathname === '/' ? '' : pathname.length > maxPath ? `${pathname.slice(0, maxPath)}…` : pathname;
			return hostname.replace(/^www\./, '') + path;
		} catch {
			return url.slice(0, 40);
		}
	}

	export function faviconUrl(url: string): string {
		try {
			return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`;
		} catch {
			return '';
		}
	}
</script>

<script lang="ts">
	interface Props {
		/** The page the card previews; the whole card links to it. */
		href: string;
		title?: string;
		/** A screenshot of the page. Leave it out for a card with no picture. */
		image?: LinkPreviewImage;
		/** A line quoted from the page. */
		excerpt?: string;
		/**
		 * `true` when the card is something to press (a touch preview, held open);
		 * `false` when it only follows a mouse pointer and can't be reached.
		 */
		interactive?: boolean;
		/** Called after the card's link is followed, so a caller can close it. */
		onopen?: () => void;
		/** Classes for the caller's placement of the card (use `:global`). */
		class?: string;
		style?: string;
		element?: HTMLAnchorElement;
	}

	let { href, title, image, excerpt, interactive = true, onopen, class: className = '', style, element = $bindable() }: Props = $props();

	const site = $derived(displayUrl(href));
	const favicon = $derived(faviconUrl(href));
</script>

<a
	bind:this={element}
	class="link-preview-card {className}"
	class:interactive
	{href}
	{style}
	target="_blank"
	rel="noopener noreferrer"
	tabindex={interactive ? undefined : -1}
	aria-hidden={interactive ? undefined : 'true'}
	onclick={() => onopen?.()}
>
	{#if image}
		<div class="shot" class:loading={image === 'loading'}>
			{#if typeof image === 'object'}
				<img src={image.src} alt="" />
			{:else if image === 'loading'}
				<span class="shot-note">Loading preview</span>
			{:else}
				<span class="shot-note">No preview</span>
			{/if}
		</div>
	{/if}
	<div class="text">
		<span class="site">
			{#if favicon}<img class="favicon" src={favicon} alt="" width="14" height="14" />{/if}
			<span class="site-url">{site}</span>
		</span>
		{#if title}<strong class="title">{title}</strong>{/if}
		{#if excerpt}<q class="excerpt">{excerpt}</q>{/if}
		{#if interactive}<span class="open">Open <span aria-hidden="true">↗</span></span>{/if}
	</div>
</a>

<style>
	.link-preview-card {
		display: block;
		box-sizing: border-box;
		width: min(20rem, calc(100vw - 2rem));
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--bg-primary);
		color: var(--text-primary);
		font-family: var(--font-sans);
		font-size: var(--fs-base);
		line-height: var(--lh-normal);
		text-decoration: none;
		box-shadow: 0 0.75rem 2rem rgb(0 0 0 / 0.3);
		transition: background var(--duration) var(--ease);
		-webkit-tap-highlight-color: transparent;
	}

	.link-preview-card:not(.interactive) {
		pointer-events: none;
	}

	.link-preview-card.interactive:hover,
	.link-preview-card.interactive:active {
		background: color-mix(in srgb, var(--bg-primary), white 8%);
	}

	.link-preview-card:focus-visible {
		outline: var(--focus-ring);
		outline-offset: 2px;
	}

	.shot {
		display: flex;
		align-items: center;
		justify-content: center;
		aspect-ratio: 16 / 10;
		border-bottom: 1px solid var(--border);
		background: var(--surface-sunken);
		overflow: hidden;
	}

	.shot img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: top left;
	}

	.shot-note {
		color: var(--text-muted);
		font-size: var(--fs-xs);
	}

	.shot.loading {
		background: linear-gradient(90deg, var(--surface-sunken) 0%, var(--surface-1) 50%, var(--surface-sunken) 100%);
		background-size: 200% 100%;
		animation: shine 1.6s linear infinite;
	}

	@keyframes shine {
		from { background-position: 200% 0; }
		to { background-position: -200% 0; }
	}

	.text {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: var(--space-3);
	}

	.site {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
		color: var(--text-muted);
		font-size: var(--fs-xs);
	}

	.favicon {
		flex: none;
		border-radius: 2px;
	}

	.site-url {
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.title {
		font-weight: var(--fw-semibold);
		line-height: var(--lh-snug);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.excerpt {
		color: var(--text-secondary);
		font-size: var(--fs-sm);
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.open {
		align-self: flex-start;
		margin-top: var(--space-1);
		color: var(--text-secondary);
		font-size: var(--fs-sm);
		font-weight: var(--fw-medium);
		text-decoration: underline;
		text-decoration-thickness: from-font;
		text-underline-offset: var(--underline-offset);
	}

	@media (prefers-reduced-motion: reduce) {
		.shot.loading {
			animation: none;
		}
	}
</style>

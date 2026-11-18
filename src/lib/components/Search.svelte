<script lang="ts">
	import { onMount, mount, unmount } from 'svelte';
	import PostMeta from './posts/PostMeta.svelte';
	import '@pagefind/component-ui/css';
	import { updateFilterDisplay } from '$lib/search-filter-display';
	import { SEARCH_QUERY_PARAM } from '$lib/opensearch';
	import { replaceState } from '$app/navigation';

	// Register browser-only custom elements after Svelte has hydrated the markup.
	let filterPane: HTMLElement;
	let root: HTMLElement;
	onMount(() => {
		// On a phone the overlay's close button takes the search button's place, so it needs its width.
		const sizeClose = () => {
			const trigger = root.querySelector<HTMLElement>('.pf-trigger-btn');
			if (trigger?.offsetWidth) root.style.setProperty('--search-button-width', `${trigger.offsetWidth}px`);
		};
		const triggerObserver = new ResizeObserver(sizeClose);
		triggerObserver.observe(root);
		sizeClose();
		// Keep the mobile pane compact while preserving the same visible filter groups.
		filterPane.setAttribute('open', window.matchMedia('(max-width: 640px)').matches ? '' : 'Type');
		// Pagefind owns result DOM; mount the site's real metadata component into each result.
		if (!customElements.get('search-result-meta')) {
			customElements.define('search-result-meta', class extends HTMLElement {
				component?: ReturnType<typeof mount>;
				connectedCallback() {
					if (this.component) return;
					this.component = mount(PostMeta, { target: this, props: {
						type: this.getAttribute('type') ?? '',
						date: this.getAttribute('date') ?? '',
						year: this.getAttribute('year') ?? '',
						permalink: this.getAttribute('permalink') ?? '',
						showInteractions: false
					} });
				}
				disconnectedCallback() {
					if (this.component) void unmount(this.component);
					this.component = undefined;
				}
			});
		}
		const filterObserver = new MutationObserver(() => updateFilterDisplay(filterPane));
		filterObserver.observe(filterPane, { childList: true, subtree: true });
		updateFilterDisplay(filterPane);
		void import('@pagefind/component-ui').then(() => customElements.whenDefined('pagefind-modal')).then(openFromUrl);
		// Pagefind moves its modal outside the navigation markup.
		document.addEventListener('click', handleResultClick);
		document.addEventListener('click', keepOpenForNewTab, true);
		return () => {
			document.removeEventListener('click', keepOpenForNewTab, true);
			filterObserver.disconnect();
			triggerObserver.disconnect();
			document.removeEventListener('click', handleResultClick);
		};
	});

	let { onResultClick }: { onResultClick?: (url: URL) => boolean } = $props();

	/** Opens search, with `query` already typed, as the command palette does. */
	export function openWith(query = '') {
		const modal = document.querySelector('pagefind-modal') as (HTMLElement & { open(): void }) | null;
		if (!modal?.open) return;
		modal.open();
		if (!query) return;
		requestAnimationFrame(() => {
			const input = modal.querySelector<HTMLInputElement>('pagefind-input input');
			if (!input) return;
			input.value = query;
			input.dispatchEvent(new Event('input', { bubbles: true }));
		});
	}

	/**
	 * A `?q=` link, such as a browser's search engine entry from /opensearch.xml, opens search on that
	 * query. The parameter comes off the address, so closing search leaves the page's own URL.
	 */
	function openFromUrl() {
		const url = new URL(location.href);
		const query = url.searchParams.get(SEARCH_QUERY_PARAM)?.trim();
		if (query === undefined) return;
		url.searchParams.delete(SEARCH_QUERY_PARAM);
		replaceState(url, {});
		openWith(query);
	}

	/**
	 * Pagefind closes its modal on any click on a result. A ⌘/Ctrl- or Shift-click opens the result in
	 * another tab, so search stays open to try the next one. Only the modal's own handler is skipped:
	 * the browser still follows the link.
	 */
	function keepOpenForNewTab(event: MouseEvent) {
		if (!(event.metaKey || event.ctrlKey || event.shiftKey)) return;
		if (event.target instanceof Element && event.target.closest('pagefind-modal pagefind-results a')) event.stopPropagation();
	}

	function handleResultClick(event: MouseEvent) {
		if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('.search-result a') : null;
		if (!link || link.target || link.hasAttribute('download')) return;
		if (!onResultClick?.(new URL(link.href))) return;
		event.preventDefault();
		const modal = link.closest('pagefind-modal') as (HTMLElement & { close(): void }) | null;
		modal?.close();
	}


	const resultTemplate = `<script type="text/pagefind-template">
		<li class="search-result" id="{{ aria.result_id }}">
			{{#if meta.image}}<img class="search-thumbnail" src="{{ meta.image | resolveUrl(url) | safeUrl }}" alt="{{ meta.image_alt }}" loading="lazy" decoding="async">{{/if}}
			<div class="search-result-text">
			<search-result-meta class="search-meta" type="{{ meta.type }}" date="{{ meta.date }}" year="{{ meta.year }}" permalink="{{ url | safeUrl }}"></search-result-meta>
			<a class="search-title" data-sveltekit-reload href="{{ url | safeUrl }}" id="{{ aria.title_id }}">{{ meta.title }}</a>
			{{#if meta.author}}<div class="search-author">{{ meta.author }}</div>{{/if}}
			<p id="{{ aria.excerpt_id }}">{{+ excerpt +}}</p>
			</div>
		</li>
	<\/script>`;
</script>

<div class="site-search" bind:this={root}>
	<pagefind-config bundle-path="/pagefind/" faceted preload></pagefind-config>
	<!-- ⌘K is the command palette; / opens search directly. -->
	<pagefind-modal-trigger compact hide-shortcut shortcut="/" placeholder="Search posts, books, wiki, and Are.na">
		<!-- Match Pagefind's button before its browser-only upgrade replaces this markup. -->
		<button class="pf-trigger-btn" type="button" aria-label="Search posts, books, wiki, and Are.na" aria-haspopup="dialog" aria-expanded="false">
			<span class="pf-trigger-icon" aria-hidden="true"></span>
		</button>
	</pagefind-modal-trigger>
	<pagefind-modal>
		<pagefind-modal-header>
			<h2 class="search-heading">Search</h2>
			<pagefind-input placeholder="Search posts, books, wiki, and Are.na…"></pagefind-input>
		</pagefind-modal-header>
		<pagefind-modal-body>
			<div class="search-layout">
				<aside class="search-filters" aria-label="Search filters">
					<pagefind-filter-pane bind:this={filterPane} open="Type" sort="count-desc"></pagefind-filter-pane>
				</aside>
				<div class="search-content">
					<pagefind-summary></pagefind-summary>
					<pagefind-results hide-sub-results>{@html resultTemplate}</pagefind-results>
				</div>
			</div>
		</pagefind-modal-body>
		<pagefind-modal-footer>
			<pagefind-keyboard-hints></pagefind-keyboard-hints>
		</pagefind-modal-footer>
	</pagefind-modal>
</div>

<style>
	.site-search {
		--pf-font: ff-dagny-web-pro, system-ui, -apple-system, sans-serif;
		--pf-text: var(--text-primary);
		--pf-text-secondary: var(--text-secondary);
		--pf-text-muted: var(--text-secondary);
		--pf-background: var(--bg-primary);
		--pf-border: var(--border);
		--pf-border-focus: var(--text-primary);
		--pf-hover: var(--surface-2);
		--pf-mark: var(--text-primary);
		--pf-skeleton: rgb(255 255 255 / 8%);
		--pf-skeleton-shine: rgb(255 255 255 / 16%);
		--pf-outline-focus: var(--text-primary);
		--pf-border-radius: var(--radius-sm);
		--pf-modal-max-width: 1080px;
		--pf-modal-max-height: 86dvh;
		--pf-modal-top: 7dvh;
		--pf-modal-backdrop: rgb(0 0 0 / 60%);
		--pf-input-height: 2.75rem;
		--pf-input-font-size: var(--fs-md);
		--pf-summary-font-size: var(--fs-sm);
		--pf-result-title-font-size: var(--fs-lg);
		--pf-result-excerpt-font-size: var(--fs-base);
		display: flex;
	}
	/* The unupgraded modal's children must never participate in the nav layout. */
	pagefind-modal:not(:defined) { display: none; }
	pagefind-modal-trigger {
		--pf-background: var(--segment);
		--pf-border: transparent;
		--pf-border-focus: transparent;
		display: flex;
	}
	pagefind-modal-trigger:hover { --pf-background: var(--segment-hover); }
	/* Pagefind's generated styles have elevated specificity and some hardcoded radii. The trigger is the nav's last segment. */
	.site-search :global(.pf-trigger-btn) {
		display: flex !important;
		align-items: center !important;
		justify-content: center !important;
		gap: var(--space-2) !important;
		width: auto !important;
		min-width: 0 !important;
		height: var(--nav-height) !important;
		padding: 0 var(--space-3) !important;
		border: 0 !important;
		border-radius: 0 var(--radius-sm) var(--radius-sm) 0 !important;
		box-shadow: inset 1px 0 0 var(--segment-divider) !important;
		color: var(--text-primary) !important;
		font-family: inherit !important;
		font-size: var(--fs-sm) !important;
		font-weight: var(--fw-medium) !important;
		line-height: var(--lh-normal) !important;
		letter-spacing: 0.01em !important;
		/* Pagefind resets text smoothing, which made this one label look heavier than its neighbours. */
		-webkit-font-smoothing: antialiased !important;
		-moz-osx-font-smoothing: grayscale !important;
		cursor: pointer;
		transition: background-color var(--duration) var(--ease) !important;
	}
	/* The magnifying glass says enough; the accessible name stays on the button. */
	.site-search :global(.pf-trigger-btn > :not(.pf-trigger-icon)) { display: none !important; }
	.site-search :global(.pf-trigger-btn:focus-visible) { outline: var(--focus-ring) !important; outline-offset: -2px !important; }
	.site-search :global(.pf-trigger-icon) {
		width: auto !important;
		height: auto !important;
		background: none !important;
		mask-image: none !important;
		-webkit-mask-image: none !important;
		font-size: inherit !important;
		line-height: inherit !important;
	}
	@media (max-width: 600px) {
		.site-search :global(.pf-trigger-btn) { padding: 0 0.625rem !important; font-size: var(--fs-lg) !important; }
	}
	.site-search :global(.pf-trigger-icon::before) { content: '🔍'; }
	/*
	 * The overlay is a page of the site: the same ground, type scale, spacing steps, corner radii and
	 * quiet gray controls. Blue stays with the navigation and with selection.
	 */
	.site-search :global(dialog.pf-modal) { border: 1px solid var(--border) !important; border-radius: var(--radius-lg) !important; }
	.site-search :global(.pf-modal-header) { display: block !important; padding: var(--space-5) var(--space-5) var(--space-4) !important; position: relative; border-bottom: 1px solid var(--border-subtle) !important; }
	.search-heading { margin: 0 0 var(--space-4); color: var(--text-primary); font-size: var(--fs-xl); font-weight: var(--fw-medium); line-height: var(--lh-snug); }
	/* Before anything is typed or filtered there is nothing to show, so the overlay is only the field. */
	.site-search :global(dialog.pf-modal:has(.pf-input:placeholder-shown):not(:has(.pf-checkbox-input:checked)) .pf-modal-body) { display: none !important; }
	.site-search :global(dialog.pf-modal:has(.pf-input:placeholder-shown):not(:has(.pf-checkbox-input:checked)) .pf-modal-header) { border-bottom: 0 !important; }
	/* The field matches the site's text inputs. */
	.site-search :global(.pf-input) { border: 1px solid var(--border-strong) !important; border-radius: var(--radius-sm) !important; background: var(--surface-sunken) !important; font-weight: var(--fw-regular) !important; transition: border-color var(--duration) var(--ease); }
	.site-search :global(.pf-input:hover),
	.site-search :global(.pf-input:focus) { border-color: var(--text-primary) !important; box-shadow: none !important; outline: none !important; }
	/* Close and clear are quiet outlined buttons, like the page trail. */
	.site-search :global(.pf-modal-close) { width: var(--nav-height) !important; height: var(--nav-height) !important; border: 1px solid var(--border) !important; border-radius: var(--radius-sm) !important; background: transparent !important; color: var(--text-primary) !important; }
	.site-search :global(.pf-modal-close:hover) { background: var(--surface-2) !important; }
	.site-search :global(.pf-modal-close:focus-visible) { outline: var(--focus-ring) !important; outline-offset: 2px !important; box-shadow: none !important; }
	.site-search :global(.pf-keyboard-key),
	.site-search :global(.pf-modal-footer-key),
	.site-search :global(.pf-key) { border: 0 !important; border-radius: var(--radius-sm) !important; background: var(--surface-2) !important; color: var(--text-secondary) !important; }
	.site-search :global(.pf-modal-body) { padding: 0 var(--space-5) !important; }
	.site-search :global(.pf-modal-footer) { padding: var(--space-3) var(--space-5) !important; border-top: 1px solid var(--border-subtle) !important; color: var(--text-muted); font-size: var(--fs-xs); }
	.search-layout { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: var(--space-6); align-items: start; }
	.search-filters { position: sticky; top: 0; max-height: 58dvh; overflow-y: auto; padding: var(--space-5) var(--space-5) var(--space-5) 0; border-right: 1px solid var(--border-subtle); }
	.search-content { min-width: 0; padding: var(--space-5) 0; }
	.site-search :global(.pf-filter-pane) { padding: 0 !important; border: 0 !important; background: transparent !important; gap: 24px !important; }
	.site-search :global([data-filter-name="Type"]) { order: 0 !important; }
	.site-search :global([data-filter-name="Year"]) { order: 1 !important; }
	.site-search :global([data-filter-name="Tag"]) { order: 2 !important; }
	.site-search :global([data-filter-name="Author"]) { order: 3 !important; }
	.site-search :global(.pf-filter-group-title) { font-size: var(--fs-sm) !important; text-transform: none !important; letter-spacing: 0 !important; font-weight: var(--fw-medium) !important; color: var(--text-primary) !important; }
	.site-search :global(.pf-filter-options) { max-height: 196px !important; overflow-y: auto !important; margin-top: 12px !important; scrollbar-width: thin; }
	.site-search :global(.pf-filter-checkbox) { overflow-wrap: anywhere !important; flex-shrink: 0 !important; line-height: 1.5 !important; min-height: 34px !important; font-size: var(--fs-sm) !important; gap: 10px !important; padding: 3px 0 !important; }
	.site-search :global(.pf-checkbox-input) { width: 14px !important; height: 14px !important; accent-color: var(--accent) !important; }
	.site-search :global(.pf-filter-checkbox:has(input:checked)) { color: white !important; }
	.site-search :global(.pf-filter-checkbox-count) { margin-left: auto !important; padding-left: 8px !important; font-variant-numeric: tabular-nums; opacity: .65; }
	.site-search :global(.pf-summary) { margin: 0 0 var(--space-2) !important; color: var(--text-muted) !important; font-size: var(--fs-sm) !important; }
	.site-search :global(.search-result) { color: white; font-family: var(--pf-font); font-weight: 400; padding: var(--space-5) 0; border-top: 1px solid var(--border-subtle); list-style: none; overflow-wrap: break-word; }
	.site-search :global(.search-result) { display: flex; gap: 20px; align-items: flex-start; }
	.site-search :global(.search-result-text) { flex: 1; min-width: 0; }
	.site-search :global(.search-thumbnail) { width: 88px; max-height: 120px; object-fit: contain; object-position: top; flex-shrink: 0; border-radius: var(--radius-sm); }
	.site-search :global(.search-meta) { display: block; margin-bottom: var(--space-1); }

	.site-search :global(.search-title) { display: block; color: var(--text-primary); font-size: var(--fs-lg); font-weight: var(--fw-semibold); line-height: var(--lh-snug); text-decoration: none; }
	/* Wiki pages live on another site. */
	.site-search :global(.search-title[href^="http"])::after { content: ' ↗'; color: var(--text-secondary); font-weight: var(--fw-regular); }
	.site-search :global(.search-title:hover) { text-decoration: underline; text-underline-offset: .15em; }
	.site-search :global(.search-author) { margin-top: var(--space-2); color: var(--text-muted); font-size: var(--fs-xs); line-height: 1.5; overflow-wrap: anywhere; }
	.site-search :global(.search-result p) { display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; font-size: var(--fs-base); line-height: var(--lh-relaxed, 1.6); margin: var(--space-2) 0 0; color: var(--text-secondary); }
	.site-search :global(.search-result mark) { background: transparent; color: white; font-weight: 600; text-decoration: underline; text-underline-offset: .15em; text-decoration-color: rgb(255 255 255 / 45%); }
	@media (max-width: 640px) {
		.site-search :global(dialog.pf-modal) { border: 0 !important; border-radius: 0 !important; }
		/* Full screen, the overlay keeps the top bar's row: its close button sits exactly where the search button was. */
		.site-search :global(.pf-modal-header) { padding: var(--nav-inset) var(--space-4) var(--space-4) !important; }
		.site-search :global(.pf-modal-close) { position: absolute !important; top: var(--nav-inset) !important; right: var(--nav-inset) !important; width: var(--search-button-width, var(--nav-height)) !important; }
		.search-heading { display: flex; align-items: center; min-height: var(--nav-height); margin-bottom: var(--space-3); padding-right: calc(var(--nav-height) + var(--space-3)); }
		.site-search :global(.pf-modal-body) { padding: 0 var(--space-4) !important; }
		.site-search :global(.pf-modal-footer) { padding: var(--space-3) var(--space-4) !important; }
		.search-layout { display: block; }
		.search-filters { position: static; max-height: none; overflow: visible; padding: var(--space-4) 0; border-right: 0; border-bottom: 1px solid var(--border-subtle); }
		.site-search :global(.pf-filter-pane) { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 18px 24px !important; align-items: start; }
		.site-search :global(.pf-filter-options) { max-height: 132px !important; }
		.site-search :global(.pf-filter-checkbox) { min-height: 40px !important; }
		.search-content { padding: var(--space-4) 0; }
		.site-search :global(.search-result) { gap: 14px; }
		.site-search :global(.search-thumbnail) { width: 60px; max-height: 84px; }
		.site-search :global(.search-result) { padding: var(--space-4) 0; }
	}
</style>

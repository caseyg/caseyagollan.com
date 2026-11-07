<script lang="ts">
	import { onMount, mount, unmount } from 'svelte';
	import PostMeta from './posts/PostMeta.svelte';
	import '@pagefind/component-ui/css';

	// Register browser-only custom elements after Svelte has hydrated the markup.
	let filterPane: HTMLElement;
	onMount(() => {
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
		void import('@pagefind/component-ui');
		// Pagefind moves its modal outside the navigation markup.
		document.addEventListener('click', handleResultClick);
		return () => document.removeEventListener('click', handleResultClick);
	});

	let { onResultClick }: { onResultClick?: (url: URL) => boolean } = $props();

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
			<search-result-meta class="search-meta" type="{{ meta.type }}" date="{{ meta.date }}" year="{{ meta.year }}" permalink="{{ url | safeUrl }}"></search-result-meta>
			<a class="search-title" data-sveltekit-reload href="{{ url | safeUrl }}" id="{{ aria.title_id }}">{{ meta.title }}</a>
			{{#if meta.author}}<div class="search-author">{{ meta.author }}</div>{{/if}}
			<p id="{{ aria.excerpt_id }}">{{+ excerpt +}}</p>
		</li>
	<\/script>`;
</script>

<div class="site-search">
	<pagefind-config bundle-path="/pagefind/" faceted preload></pagefind-config>
	<pagefind-modal-trigger compact hide-shortcut placeholder="Search posts and books">
		<!-- Match Pagefind's button before its browser-only upgrade replaces this markup. -->
		<button class="pf-trigger-btn" type="button" aria-label="Search posts and books" aria-haspopup="dialog" aria-expanded="false">
			<span class="pf-trigger-icon" aria-hidden="true"></span>
		</button>
	</pagefind-modal-trigger>
	<pagefind-modal>
		<pagefind-modal-header>
			<div class="search-heading">
				<h2>Search</h2>
				<p>Posts &amp; library</p>
			</div>
			<pagefind-input placeholder="Search posts and books…"></pagefind-input>
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
		--pf-hover: var(--accent);
		--pf-mark: var(--text-primary);
		--pf-skeleton: rgb(255 255 255 / 8%);
		--pf-skeleton-shine: rgb(255 255 255 / 16%);
		--pf-outline-focus: var(--text-primary);
		--pf-border-radius: 0;
		--pf-modal-max-width: 1080px;
		--pf-modal-max-height: 86dvh;
		--pf-modal-top: 7dvh;
		--pf-modal-backdrop: rgb(0 0 0 / 60%);
		--pf-input-height: 48px;
		--pf-input-font-size: 18px;
		--pf-summary-font-size: 14px;
		--pf-result-title-font-size: 22px;
		--pf-result-excerpt-font-size: 16px;
		display: flex;
		flex: 0 0 60px;
		width: 60px;
		height: 48px;
	}
	/* The unupgraded modal's children must never participate in the nav layout. */
	pagefind-modal:not(:defined) { display: none; }
	pagefind-modal-trigger {
		--pf-background: var(--accent);
		--pf-border: var(--accent);
		--pf-border-focus: var(--accent-hover);
		width: 60px;
		height: 48px;
		flex: none;
	}
	pagefind-modal-trigger:hover { --pf-background: var(--accent-hover); }
	/* Pagefind's generated styles have elevated specificity and some hardcoded radii. */
	.site-search :global(.pf-trigger-btn) { justify-content: center !important; padding: 0 10px !important; }
	.site-search :global(.pf-trigger-icon) {
		width: auto !important;
		height: auto !important;
		background: none !important;
		mask-image: none !important;
		-webkit-mask-image: none !important;
		font-size: 2rem !important;
		line-height: 1.5 !important;
	}
	.site-search :global(.pf-trigger-icon::before) { content: '🔍'; }
	.site-search :global(dialog),
	.site-search :global(dialog *),
	.site-search :global(.pf-trigger-btn) { border-radius: 0 !important; }
	/* Structure stays quiet; blue is reserved for actions and selected states. */
	.site-search :global(.pf-modal-header) { display: block !important; padding: 28px 32px 20px !important; position: relative; }
	.search-heading { margin-bottom: 20px; color: var(--text-primary); }
	.search-heading h2 { margin: 0; font-size: 36px; font-weight: 400; line-height: 1.1; letter-spacing: -.03em; }
	.search-heading p { margin: 8px 0 0; font-size: 14px; font-weight: 400; color: var(--text-secondary); }
	.site-search :global(.pf-input) { background: rgb(0 0 0 / 8%) !important; border: 1px solid var(--border) !important; font-weight: 400 !important; }
	.site-search :global(.pf-input:focus) { border-color: white !important; box-shadow: none !important; }
	.site-search :global(.pf-modal-body) { padding: 0 32px !important; }
	.site-search :global(.pf-modal-footer) { padding: 12px 32px !important; }
	.search-layout { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 36px; align-items: start; }
	.search-filters { position: sticky; top: 0; max-height: 58dvh; overflow-y: auto; padding: 24px 24px 24px 0; border-right: 1px solid var(--border); }
	.search-content { min-width: 0; padding: 24px 0; }
	.site-search :global(.pf-filter-pane) { padding: 0 !important; border: 0 !important; background: transparent !important; gap: 24px !important; }
	.site-search :global([data-filter-name="Type"]) { order: 0 !important; }
	.site-search :global([data-filter-name="Year"]) { order: 1 !important; }
	.site-search :global([data-filter-name="Tag"]) { order: 2 !important; }
	.site-search :global([data-filter-name="Author"]) { order: 3 !important; }
	.site-search :global(.pf-filter-group-title) { font-size: 13px !important; text-transform: none !important; letter-spacing: 0 !important; font-weight: 500 !important; color: white !important; }
	.site-search :global(.pf-filter-options) { max-height: 196px !important; overflow-y: auto !important; margin-top: 12px !important; scrollbar-width: thin; }
	.site-search :global(.pf-filter-checkbox) { overflow-wrap: anywhere !important; flex-shrink: 0 !important; line-height: 1.5 !important; min-height: 34px !important; font-size: 13px !important; gap: 10px !important; padding: 3px 0 !important; }
	.site-search :global(.pf-checkbox-input) { width: 14px !important; height: 14px !important; accent-color: blue !important; }
	.site-search :global(.pf-filter-checkbox:has(input:checked)) { color: white !important; }
	.site-search :global(.pf-filter-checkbox-count) { margin-left: auto !important; padding-left: 8px !important; font-variant-numeric: tabular-nums; opacity: .65; }
	.site-search :global(.pf-summary) { margin: 0 0 8px !important; font-size: 13px !important; }
	.site-search :global(.search-result) { color: white; font-family: var(--pf-font); font-weight: 400; padding: 24px 0; border-top: 1px solid var(--border); list-style: none; overflow-wrap: break-word; }
	.site-search :global(.search-meta) { display: block; margin-bottom: 10px; }
	.site-search :global(.search-meta .post-type) { background: rgba(255, 255, 255, 0.15); color: white; }

	.site-search :global(.search-title) { display: block; color: white; font-size: 23px; font-weight: 400; line-height: 1.25; letter-spacing: -.015em; text-decoration: none; }
	.site-search :global(.search-title:hover) { text-decoration: underline; text-underline-offset: .15em; }
	.site-search :global(.search-author) { margin-top: 8px; color: var(--text-secondary); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
	.site-search :global(.search-result p) { display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; font-size: 15px; line-height: 1.6; margin: 12px 0 0; color: var(--text-secondary); }
	.site-search :global(.search-result mark) { background: transparent; color: white; font-weight: 600; text-decoration: underline; text-underline-offset: .15em; text-decoration-color: rgb(255 255 255 / 45%); }
	@media (max-width: 640px) {
		.site-search :global(.pf-modal-header) { padding: 24px 20px 16px !important; }
		.site-search :global(.pf-modal-close) { position: absolute !important; top: 16px !important; right: 12px !important; }
		.search-heading { margin-bottom: 20px; }
		.search-heading h2 { font-size: 32px; }
		.search-heading p { font-size: 13px; }
		.site-search :global(.pf-modal-body) { padding: 0 20px !important; }
		.site-search :global(.pf-modal-footer) { padding: 10px 20px !important; }
		.search-layout { display: block; }
		.search-filters { position: static; max-height: none; overflow: visible; padding: 18px 0; border-right: 0; border-bottom: 1px solid var(--border); }
		.site-search :global(.pf-filter-pane) { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 18px 24px !important; align-items: start; }
		.site-search :global(.pf-filter-options) { max-height: 132px !important; }
		.site-search :global(.pf-filter-checkbox) { min-height: 40px !important; }
		.search-content { padding: 20px 0; }
		.site-search :global(.search-title) { font-size: 22px; }
		.site-search :global(.search-result) { padding: 22px 0; }
	}
</style>

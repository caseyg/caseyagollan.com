<script lang="ts">
	import { onMount } from 'svelte';
	import '@pagefind/component-ui/css';

	// Register browser-only custom elements after Svelte has hydrated the markup.
	onMount(() => { void import('@pagefind/component-ui'); });

	const resultTemplate = `<script type="text/pagefind-template">
		<li class="search-result" id="{{ aria.result_id }}">
			<a data-sveltekit-reload href="{{ url | safeUrl }}" id="{{ aria.title_id }}">{{ meta.title }}</a>
			<div class="search-meta">
				<span>{{ meta.type }}</span>
				{{#if meta.date}}<span>{{ meta.date }}</span>{{/if}}
				{{#if meta.author}}<span>{{ meta.author }}</span>{{/if}}
				{{#if meta.year}}<span>{{ meta.year }}</span>{{/if}}
				{{#if meta.isbn}}<span>ISBN {{ meta.isbn }}</span>{{/if}}
			</div>
			<p id="{{ aria.excerpt_id }}">{{+ excerpt +}}</p>
			{{#if meta.tags}}<small>{{ meta.tags }}</small>{{/if}}
		</li>
	<\/script>`;
</script>

<div class="site-search">
	<pagefind-config bundle-path="/pagefind/"></pagefind-config>
	<pagefind-modal-trigger compact hide-shortcut placeholder="Search posts and books">
		<!-- Match Pagefind's button before its browser-only upgrade replaces this markup. -->
		<button class="pf-trigger-btn" type="button" aria-label="Search posts and books" aria-haspopup="dialog" aria-expanded="false">
			<span class="pf-trigger-icon" aria-hidden="true"></span>
		</button>
	</pagefind-modal-trigger>
	<pagefind-modal>
		<pagefind-modal-header>
			<pagefind-input placeholder="Search posts and books…"></pagefind-input>
		</pagefind-modal-header>
		<pagefind-modal-body>
			<pagefind-filter-dropdown filter="Type" label="Type" single-select></pagefind-filter-dropdown>
			<pagefind-summary></pagefind-summary>
			<pagefind-results hide-sub-results>{@html resultTemplate}</pagefind-results>
		</pagefind-modal-body>
		<pagefind-modal-footer>
			<pagefind-keyboard-hints></pagefind-keyboard-hints>
		</pagefind-modal-footer>
	</pagefind-modal>
</div>

<style>
	.site-search {
		--pf-text: #111;
		--pf-background: white;
		--pf-outline-focus: blue;
		--pf-modal-max-width: 760px;
		--pf-modal-backdrop: rgb(0 0 0 / 60%);
		--pf-input-height: 44px;
		--pf-result-title-font-size: 18px;
		display: flex;
		flex: 0 0 47px;
		width: 47px;
		height: 48px;
	}
	/* The unupgraded modal's children must never participate in the nav layout. */
	pagefind-modal:not(:defined) { display: none; }
	pagefind-modal-trigger {
		--pf-background: blue;
		--pf-text-muted: white;
		--pf-border: blue;
		--pf-border-focus: rgb(73, 73, 255);
		--pf-input-height: 48px;
		--pf-border-radius: 5px;
		width: 47px;
		height: 48px;
		flex: none;
	}
	pagefind-modal-trigger:hover { --pf-background: rgb(73, 73, 255); }
	.site-search :global(.search-result) { padding: 18px 0; border-top: 1px solid #ddd; list-style: none; }
	.site-search :global(.search-result a) { color: blue; font-size: 1.15rem; }
	.site-search :global(.search-meta) { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-top: 6px; color: #555; font-size: .85rem; }
	.site-search :global(.search-result p) { line-height: 1.5; margin: 12px 0; }
	.site-search :global(.search-result small) { color: #555; }
	.site-search :global(.search-result mark) { background: #ffff88; color: #111; }
</style>

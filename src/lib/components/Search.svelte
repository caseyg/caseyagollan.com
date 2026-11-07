<script lang="ts">
	import { tick } from 'svelte';
	import { POST_TYPES } from '$lib/posts-types';

	type Result = { url: string; meta: Record<string, string>; excerpt: string };
	type Pagefind = { search: (query: string, options: { filters?: Record<string, string> }) => Promise<{ results: { data: () => Promise<Result> }[] }> };
	let dialog: HTMLDialogElement;
	let input: HTMLInputElement;
	let query = $state('');
	let type = $state('');
	let results = $state<Result[]>([]);
	let total = $state(0);
	let loading = $state(false);
	let error = $state('');
	let engine: Promise<Pagefind> | undefined;
	let revision = 0;
	let timer: ReturnType<typeof setTimeout>;

	async function open() {
		dialog.showModal();
		await tick();
		input.focus();
		if (query.trim()) search();
	}
	async function search() {
		const current = ++revision;
		clearTimeout(timer);
		if (!query.trim()) { results = []; total = 0; loading = false; error = ''; return; }
		loading = true;
		error = '';
		timer = setTimeout(async () => {
			try {
				const path = '/pagefind/pagefind.js';
				engine ??= import(/* @vite-ignore */ path).catch(e => { engine = undefined; throw e; });
				const pagefind = await engine;
				const response = await pagefind.search(query, { filters: type ? { Type: type } : undefined });
				const data = await Promise.all(response.results.slice(0, 30).map(result => result.data()));
				if (current !== revision) return;
				results = data; total = response.results.length;
			} catch {
				if (current === revision) error = 'Search could not load. Please try again.';
			} finally { if (current === revision) loading = false; }
		}, 150);
	}
	function shortcut(event: KeyboardEvent) {
		if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
			event.preventDefault();
			if (dialog.open) dialog.close(); else open();
		}
	}
</script>

<svelte:window onkeydown={shortcut} />
<button class="search-trigger" onclick={open} aria-label="Search posts and books" title="Search (⌘/Ctrl K)">
	<svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
</button>
<dialog onkeydown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dialog.close(); } }} bind:this={dialog} aria-labelledby="search-title" onclick={event => { if (event.target === dialog) dialog.close(); }} onclose={() => { ++revision; clearTimeout(timer); loading = false; }}>
	<div class="search-panel">
		<header><h2 id="search-title">Search</h2><button class="close" onclick={() => dialog.close()} aria-label="Close search">✕</button></header>
		<div class="controls">
			<label class="query">Search posts and books<input bind:this={input} bind:value={query} oninput={event => { query = event.currentTarget.value; search(); }} type="search" placeholder="Search full text and metadata…" /></label>
			<label>Type<select aria-label="Type" bind:value={type} onchange={event => { type = event.currentTarget.value; search(); }}><option value="">All types</option>{#each [...POST_TYPES, 'book'] as item}<option value={item}>{item}</option>{/each}</select></label>
		</div>
		<p role="status">{error || (loading ? 'Searching…' : query.trim() ? `${total} results${total > 30 ? ' · showing first 30; refine your search for more' : ''}` : 'Search posts, books, authors, tags, and more.')}</p>
		<ul>{#each results as result}<li>
			<a data-sveltekit-reload href={result.url} onclick={() => dialog.close()}>{result.meta.title}</a>
			<small>{[result.meta.type, result.meta.date, result.meta.author, result.meta.year, result.meta.isbn].filter(Boolean).join(' · ')}</small>
			<!-- Pagefind produces the excerpt from indexed site content. -->
			<p>{@html result.excerpt}</p>
			{#if result.meta.tags}<small>{result.meta.tags}</small>{/if}
		</li>{/each}</ul>
	</div>
</dialog>

<style>
	.search-trigger { background: blue; color: white; border: 0; border-radius: 5px; padding: 0 10px; cursor: pointer; display: flex; align-items: center; }
	.search-trigger:hover { background: rgb(73, 73, 255); }
	dialog { width: min(760px, calc(100vw - 24px)); max-height: calc(100dvh - 48px); padding: 0; border: 1px solid blue; border-radius: 8px; color: #111; background: white; box-sizing: border-box; }
	dialog::backdrop { background: rgb(0 0 0 / 60%); }
	.search-panel { padding: clamp(16px, 4vw, 28px); }
	header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
	h2 { margin: 0; }
	.close { background: none; border: 0; cursor: pointer; font-size: 1.5rem; padding: 6px; }
	.controls { display: flex; gap: 12px; flex-wrap: wrap; }
	label { display: flex; flex-direction: column; gap: 6px; font-size: .85rem; }
	.query { flex: 1; min-width: 180px; }
	input, select { font: inherit; font-size: 1rem; padding: 10px; border: 1px solid #777; border-radius: 4px; background: white; color: #111; min-width: 0; }
	ul { list-style: none; padding: 0; margin: 0; }
	li { padding: 18px 0; border-top: 1px solid #ddd; }
	a { color: blue; font-size: 1.15rem; }
	small { display: block; margin-top: 6px; color: #555; }
	p { line-height: 1.5; }
	:global(.search-panel mark) { background: #ffff88; color: #111; }
</style>

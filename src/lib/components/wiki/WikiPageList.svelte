<script lang="ts">
	import { onMount } from 'svelte';
	import { Count, TextField, ToggleChip } from '$lib/components/ui';
	import { wikiPath } from '$lib/wiki/resolve';
	import type { WikiPageSummary } from '$lib/wiki/types';

	interface Props {
		pages: WikiPageSummary[];
		/** Starts filtered to this tag; otherwise read from `?tag=` once the page loads. */
		tag?: string;
	}

	let { pages, tag: initialTag }: Props = $props();

	let query = $state('');
	let tag: string | undefined = $state(initialTag);

	const tags = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const page of pages) for (const name of page.tags) counts.set(name, (counts.get(name) ?? 0) + 1);
		return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
	});
	const shown = $derived.by(() => {
		const words = query.toLowerCase().split(/\s+/).filter(Boolean);
		return pages.filter((page) => (!tag || page.tags.includes(tag)) && words.every((word) => `${page.title} ${page.excerpt}`.toLowerCase().includes(word)));
	});
	// Under a letter, like the index at the back of a book.
	const groups = $derived.by(() => {
		const byLetter = new Map<string, WikiPageSummary[]>();
		for (const page of shown) {
			const first = page.title.normalize('NFKD').charAt(0).toUpperCase();
			const letter = /[A-Z]/.test(first) ? first : /\d/.test(first) ? '#' : '…';
			byLetter.set(letter, [...(byLetter.get(letter) ?? []), page]);
		}
		return [...byLetter];
	});

	function choose(name: string | undefined) {
		tag = name;
		const url = new URL(location.href);
		if (name) url.searchParams.set('tag', name);
		else url.searchParams.delete('tag');
		history.replaceState(history.state, '', url);
	}

	onMount(() => {
		tag ??= new URL(location.href).searchParams.get('tag') ?? undefined;
	});
</script>

<div class="wiki-page-list" data-wiki-previews>
	<div class="filters">
		<TextField label="Filter pages" type="search" placeholder="Title or text" autocomplete="off" bind:value={query} />
		{#if tags.length}
			<div class="tags" role="group" aria-label="Tags">
				{#each tags as [name, count] (name)}
					<ToggleChip pressed={tag === name} onclick={(event) => { event.preventDefault(); choose(tag === name ? undefined : name); }}>#{name} <Count value={count} /></ToggleChip>
				{/each}
			</div>
		{/if}
	</div>

	<p class="summary" aria-live="polite">{shown.length === pages.length ? `${pages.length} pages` : `${shown.length} of ${pages.length} pages`}</p>

	{#if groups.length}
		{#each groups as [letter, entries] (letter)}
			<section class="group">
				<h3 class="letter">{letter}</h3>
				<ul>
					{#each entries as page (page.slug)}
						<li>
							<a href={wikiPath(page.slug)}>{page.title}</a>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	{:else}
		<p class="empty">No pages match. <button type="button" onclick={() => { query = ''; choose(undefined); }}>Show every page</button></p>
	{/if}
</div>

<style>
	.wiki-page-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.filters :global(.text-field) {
		margin: 0 0 var(--space-3);
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.summary {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--fs-sm);
	}

	.group {
		display: grid;
		grid-template-columns: 2rem 1fr;
		align-items: baseline;
		padding-top: var(--space-3);
		border-top: 1px solid var(--border-subtle);
	}

	.letter {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--fs-sm);
		font-weight: var(--fw-medium);
	}

	ul {
		columns: 2 14rem;
		column-gap: var(--space-5);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		break-inside: avoid;
		padding: 2px 0;
	}

	a {
		color: var(--text-primary);
		text-decoration: none;
	}

	a:hover {
		text-decoration: underline;
		text-underline-offset: var(--underline-offset);
	}

	.empty {
		margin: 0;
		color: var(--text-secondary);
	}

	.empty button {
		padding: 0;
		border: 0;
		background: none;
		color: var(--text-primary);
		font: inherit;
		text-decoration: underline;
		cursor: pointer;
	}
</style>

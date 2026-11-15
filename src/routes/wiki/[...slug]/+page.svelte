<script lang="ts">
	import type { PageData } from './$types';
	import Nav from '$lib/components/Nav.svelte';
	import { Page, PageHeader } from '$lib/components/ui';
	import { WikiArticle, WikiBacklinks, WikiGraphPanel, WikiStack, WikiToc } from '$lib/components/wiki';
	import { wikiStackState } from '$lib/components/wiki/stack-state.svelte';
	import { wikiCrumb } from '$lib/components/wiki/trail';

	let { data }: { data: PageData } = $props();
	const stack = wikiStackState();
</script>

<svelte:head>
	<title>{data.page.title} - Casey Gollan</title>
	{#if data.page.excerpt}<meta name="description" content={data.page.excerpt} />{/if}
	<meta property="og:title" content={data.page.title} />
	<meta property="og:type" content="article" />
</svelte:head>

<Nav currentPage="wiki" />

{#snippet header()}
	<PageHeader trail={[wikiCrumb(data.page.slug), { label: data.page.title, href: `/wiki/${data.page.slug}`, current: true }]} title={data.page.title} />
{/snippet}

{#snippet around()}
	<WikiToc headings={data.page.headings} />
	{#if data.graph.nodes.length > 1}
		<WikiGraphPanel layout={data.graph} current={data.page.slug} moreHref="/wiki/#graph" />
	{/if}
	<WikiBacklinks pages={data.backlinks} />
{/snippet}

<WikiStack root={data.page.slug} title={data.page.title} stack={stack.stack} onchange={stack.change}>
	<Page asideLabel="Around this page">
		{@render header()}
		<WikiArticle page={data.page} />
		{#snippet aside()}{@render around()}{/snippet}
	</Page>

	{#snippet rootPane()}
		{@render header()}
		<WikiArticle page={data.page} />
		<aside class="around" aria-label="Around this page">{@render around()}</aside>
	{/snippet}
</WikiStack>

<style>
	.around {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		margin-top: var(--space-7);
		padding-top: var(--space-5);
		border-top: 1px solid var(--border);
	}
</style>

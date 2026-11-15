<script lang="ts">
	import type { PageData } from './$types';
	import Nav from '$lib/components/Nav.svelte';
	import { Page, PageHeader } from '$lib/components/ui';
	import { WikiArticle, WikiBacklinks, WikiGraphPanel, WikiToc } from '$lib/components/wiki';
	import { wikiCrumb } from '$lib/components/wiki/trail';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{data.page.title} - Casey Gollan</title>
	{#if data.page.excerpt}<meta name="description" content={data.page.excerpt} />{/if}
	<meta property="og:title" content={data.page.title} />
	<meta property="og:type" content="article" />
</svelte:head>

<Nav currentPage="wiki" />

<Page asideLabel="Around this page">
	<PageHeader trail={[wikiCrumb(data.page.slug), { label: data.page.title, href: `/wiki/${data.page.slug}`, current: true }]} title={data.page.title} />
	<WikiArticle page={data.page} />

	{#snippet aside()}
		<WikiToc headings={data.page.headings} />
		{#if data.graph.nodes.length > 1}
			<WikiGraphPanel layout={data.graph} current={data.page.slug} moreHref="/wiki/#graph" />
		{/if}
		<WikiBacklinks pages={data.backlinks} />
	{/snippet}
</Page>

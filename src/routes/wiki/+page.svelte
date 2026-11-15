<script lang="ts">
	import type { PageData } from './$types';
	import Nav from '$lib/components/Nav.svelte';
	import { Page, PageHeader, Section } from '$lib/components/ui';
	import { WikiArticle, WikiGraph, WikiPageList } from '$lib/components/wiki';
	import { wikiCrumb } from '$lib/components/wiki/trail';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Wiki - Casey Gollan</title>
	<meta name="description" content="Casey Gollan's wiki: notes on research ops, organizing, art and education, published from Obsidian at cag.wiki." />
	<meta property="og:title" content="Wiki - Casey Gollan" />
	<meta property="og:type" content="website" />
</svelte:head>

<Nav currentPage="wiki" />

<Page>
	<PageHeader trail={[{ ...wikiCrumb('', true), count: data.pages.length }]} title="Wiki" />
	{#if data.home}<WikiArticle page={data.home} showTitle={false} />{/if}
	<div id="graph">
		<Section title="Graph">
			<WikiGraph layout={data.graph} label="Every wiki page and the links between them" />
		</Section>
	</div>
	<Section title="All pages">
		<WikiPageList pages={data.pages} />
	</Section>
</Page>

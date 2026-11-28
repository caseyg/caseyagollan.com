<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { blocks, feedItems } from '$lib/storybook/fixtures';
	import { blockKey, type Block } from '$lib/tables';
	import type { FeedItem } from '$lib/table-feed';
	import BlockFeed from './BlockFeed.svelte';

	const { Story } = defineMeta({ title: 'Tables/BlockFeed', component: BlockFeed, tags: ['!autodocs'] });

	// A fixed afternoon in New York, so the days and times read the same on every run.
	const now = new Date('2026-11-28T20:30:00Z');
	const timeZone = 'America/New_York';
	const load = async (since: Date): Promise<FeedItem[]> => feedItems(now).filter((item) => Date.parse(item.at) >= since.getTime());
	const add = (added: Block[]) => console.log('add', added);
	const frame = 'width: 22rem; height: 36rem; padding: var(--space-4); border: 1px solid var(--border); display: flex;';
</script>

<!-- The past week from every source: a group for each day, newest first, each line with its time. -->
<Story asChild name="Past week">
	<div style={frame}><BlockFeed {load} onadd={add} {now} {timeZone} /></div>
</Story>

<!-- What is on the table already stays in the list, in gray. -->
<Story asChild name="Some on the table">
	<div style={frame}><BlockFeed {load} onadd={add} placed={[blocks.arenaImage, blocks.repost, blocks.arenaLink].map(blockKey)} {now} {timeZone} /></div>
</Story>

<!-- Readwise and Raindrop switched off with their pills. -->
<Story asChild name="Sources switched off">
	<div style={frame}><BlockFeed {load} onadd={add} off={['readwise', 'raindrop']} {now} {timeZone} /></div>
</Story>

<!-- A visitor's feed has the site's posts only, so there are no pills to switch. -->
<Story asChild name="Posts only">
	<div style={frame}><BlockFeed load={async (since) => (await load(since)).filter((item) => item.source === 'post')} onadd={add} {now} {timeZone} /></div>
</Story>

<Story asChild name="Nothing this week">
	<div style={frame}><BlockFeed load={async () => []} onadd={add} {now} {timeZone} /></div>
</Story>

<Story asChild name="Reading">
	<div style={frame}><BlockFeed load={() => new Promise(() => {})} onadd={add} {now} {timeZone} /></div>
</Story>

<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { blocks } from '$lib/storybook/fixtures';
	import { blockKey, type Block } from '$lib/tables';
	import BlockList from './BlockList.svelte';

	const { Story } = defineMeta({ title: 'Tables/BlockList', component: BlockList, tags: ['!autodocs'] });

	const rows = [blocks.note, blocks.arenaImage, blocks.raindrop, blocks.book, blocks.wiki, blocks.arenaText].map((block) => ({ block }));
	const add = (added: Block[]) => console.log('add', added);
	const frame = 'width: 22rem; height: 30rem; padding: var(--space-4); border: 1px solid var(--border); display: flex;';
</script>

<!-- A click adds a line; shift-click selects a range, and ⌘ or Ctrl-click one line at a time. -->
<Story asChild name="Lines">
	<div style={frame}><BlockList groups={[{ rows }]} onadd={add} /></div>
</Story>

<!-- Three selected: dragging any of them takes all three, and the bar at the bottom adds them together. -->
<Story asChild name="Several selected">
	<div style={frame}><BlockList groups={[{ rows }]} onadd={add} selected={rows.slice(1, 4).map((row) => blockKey(row.block))} /></div>
</Story>

<!-- Lines already on the table stay where they are in the list, gray, and can't be added twice. -->
<Story asChild name="Some on the table">
	<div style={frame}><BlockList groups={[{ rows: rows.map((row, at) => ({ ...row, placed: at % 2 === 1 })) }]} onadd={add} /></div>
</Story>

<!-- Under headings, with a note at the end of each line: the feed's days and times. -->
<Story asChild name="Grouped, with notes">
	<div style={frame}>
		<BlockList
			groups={[
				{ label: 'Today', rows: rows.slice(0, 2).map((row, at) => ({ ...row, note: ['2:10 pm', '9:41 am'][at] })) },
				{ label: 'Yesterday', rows: rows.slice(2, 5).map((row, at) => ({ ...row, note: ['8:15 pm', '1:02 pm', '7:30 am'][at], placed: at === 1 })) },
				{ label: 'Wednesday, Nov 25', rows: rows.slice(5).map((row) => ({ ...row, note: '11:48 am' })) }
			]}
			onadd={add}
		/>
	</div>
</Story>

<Story asChild name="Empty">
	<div style={frame}><BlockList groups={[{ rows: [] }]} onadd={add} empty="Nothing matches." /></div>
</Story>

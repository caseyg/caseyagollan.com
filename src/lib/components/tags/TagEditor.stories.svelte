<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import TagEditor, { type TagTarget } from './TagEditor.svelte';

	const { Story } = defineMeta({ title: 'Tags/TagEditor', component: TagEditor, tags: ['!autodocs'] });

	const suggestions = ['indieweb', 'changelog', 'reading', 'tables', 'research', 'tools for thought'];
	const one: TagTarget[] = [{ ref: 'post:/2026/11/13/against-disliteracy/', title: 'Against disliteracy', tags: ['reading'] }];
	const several: TagTarget[] = [
		{ ref: 'post:/2026/11/06/changelog/', title: '2026-11-06 Changelog', tags: ['changelog', 'indieweb'], edit: { add: ['tables'], remove: [] } },
		{ ref: 'raindrop:101', title: 'Calm technology', tags: ['research', 'indieweb'], edit: { add: ['tables'], remove: ['research'] } },
		{ ref: 'readwise:document:01jabcdefghjkmnpqrstvwxyz0', title: 'How to take smart notes', tags: ['reading'], edit: { add: ['tables'], remove: [] } }
	];
	const noop = () => {};
	const frame = 'width: 22rem; height: 30rem; padding: var(--space-4); border: 1px solid var(--border); display: flex;';
</script>

<Story asChild name="One post">
	<div style={frame}><TagEditor targets={one} {suggestions} onadd={noop} onremove={noop} onclose={noop} /></div>
</Story>

<!-- A selection across posts, Raindrop and Readwise, with changes staged: shared tags first, and how many of the selection have each. -->
<Story asChild name="A selection with staged changes">
	<div style={frame}><TagEditor targets={several} {suggestions} staged={3} onadd={noop} onremove={noop} onreview={noop} onclose={noop} /></div>
</Story>

<Story asChild name="The whole table">
	<div style={frame}><TagEditor targets={several} scope="table" {suggestions} onadd={noop} onremove={noop} onclose={noop} /></div>
</Story>

<Story asChild name="Reading tags">
	<div style={frame}><TagEditor targets={[{ ref: 'raindrop:101', title: 'Calm technology' }]} reading onadd={noop} onremove={noop} onclose={noop} /></div>
</Story>

<Story asChild name="Nothing with tags">
	<div style={frame}><TagEditor targets={[]} scope="table" onadd={noop} onremove={noop} onclose={noop} /></div>
</Story>

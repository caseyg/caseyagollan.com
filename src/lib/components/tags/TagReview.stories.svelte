<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import TagReview, { type ReviewGroup } from './TagReview.svelte';

	const { Story } = defineMeta({ title: 'Tags/TagReview', component: TagReview, tags: ['!autodocs'] });

	const groups: ReviewGroup[] = [
		{ source: 'post', items: [
			{ ref: 'post:/2026/11/06/changelog/', title: '2026-11-06 Changelog', url: '/2026/11/06/changelog/', tags: [{ name: 'changelog', state: 'kept' }, { name: 'tables', state: 'added' }] },
			{ ref: 'post:/2026/11/13/against-disliteracy/', title: 'Against disliteracy', url: '/2026/11/13/against-disliteracy/', tags: [{ name: 'reading', state: 'kept' }, { name: 'misc', state: 'removed' }, { name: 'tables', state: 'added' }] }
		] },
		{ source: 'raindrop', items: [{ ref: 'raindrop:101', title: 'Calm technology', tags: [{ name: 'research', state: 'removed' }, { name: 'tables', state: 'added' }] }] },
		{ source: 'readwise', items: [{ ref: 'readwise:highlight:42', title: 'How to take smart notes', tags: [{ name: 'tables', state: 'added' }] }] }
	];
	const noop = () => {};
	const frame = 'width: 22rem; height: 36rem; padding: var(--space-4); border: 1px solid var(--border); display: flex;';
	const summary = 'Tag 2 posts: +tables −misc';
</script>

<!-- What is staged, by where it will be written; posts go in one commit whose message can be changed. -->
<Story asChild name="Ready to save">
	<div style={frame}><TagReview {groups} {summary} onsave={noop} ondiscard={noop} ondiscardall={noop} onback={noop} onclose={noop} /></div>
</Story>

<!-- On a preview or the demo nothing is written: saving rehearses and says what would happen. -->
<Story asChild name="A dry run">
	<div style={frame}>
		<TagReview {groups} {summary} rehearsed={['post', 'raindrop', 'readwise']} results={[{ source: 'post', dryRun: true, message: summary, items: [] }]} onsave={noop} ondiscard={noop} ondiscardall={noop} onback={noop} onclose={noop} />
	</div>
</Story>

<Story asChild name="Saved, with one failure">
	<div style={frame}>
		<TagReview
			groups={[groups[1]]}
			{summary}
			results={[
				{ source: 'post', dryRun: false, commit: { sha: 'c60a586', url: 'https://github.com/' }, message: summary, items: [{ ref: 'post:/2026/11/06/changelog/', ok: true }, { ref: 'post:/2026/11/13/against-disliteracy/', ok: true }] },
				{ source: 'raindrop', dryRun: false, items: [{ ref: 'raindrop:101', ok: false, error: 'It couldn’t be reached.' }] }
			]}
			onsave={noop} ondiscard={noop} ondiscardall={noop} onback={noop} onclose={noop}
		/>
	</div>
</Story>

<Story asChild name="Saving">
	<div style={frame}><TagReview {groups} {summary} saving onsave={noop} ondiscard={noop} onclose={noop} /></div>
</Story>

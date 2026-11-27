<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import DraftsMenu from './DraftsMenu.svelte';
	import ComposerBar from './ComposerBar.svelte';
	import Button from '../ui/Button.svelte';

	const { Story } = defineMeta({ title: 'Composer/DraftsMenu', component: DraftsMenu, tags: ['!autodocs'] });
	const composer = [
		{ id: '20261125-1a2b3c4d', kind: 'note' as const, title: 'A thought about tables and areas', updated: '2026-11-25T18:20:00Z' },
		{ id: '20261120-5e6f7a8b', kind: 'bookmark' as const, title: 'https://indieweb.org/Micropub-extensions', updated: '2026-11-20T14:05:00Z' }
	];
	const content = { drafts: [
		{ path: '/2026/11/25/changelog/', folder: 'articles', title: '2026-11-25 Changelog', date: '2026-11-25T23:00:00-05:00', pull: { number: 21, title: 'Draft November 25 changelog' } },
		{ path: '/2025/09/07/testing-ia-writer-as-a/', folder: 'articles', title: 'Testing iA writer as a micropub client', date: '2025-09-07T14:09:09.524Z' }
	] };
	// Never settles, as while GitHub is still answering.
	const waiting = new Promise<typeof content>(() => {});
</script>

<!-- The menu opens from the composer's bar; press the drafts icon to see each state. -->
{#snippet bar(args: Omit<import("svelte").ComponentProps<typeof DraftsMenu>, "csrf">)}
	<ComposerBar>
		<Button variant="icon" icon="close" label="Close" />
		{#snippet actions()}
			<DraftsMenu csrf="story" {...args} />
			<Button variant="quiet">Save draft</Button>
			<Button variant="primary">Publish</Button>
		{/snippet}
	</ComposerBar>
{/snippet}

<Story name="Composer and content drafts" args={{ drafts: composer, content, currentId: composer[0].id }} template={bar} />
<Story name="Looking on GitHub" args={{ drafts: composer, content: waiting }} template={bar} />
<Story name="Content drafts only" args={{ content }} template={bar} />
<Story name="Nothing saved" args={{ drafts: [], content: { drafts: [] } }} template={bar} />
<Story name="GitHub unavailable" args={{ drafts: composer, content: { drafts: [], error: 'Drafts in the content repository could not be loaded.' } }} template={bar} />
<Story name="Composer drafts only" args={{ drafts: composer }} template={bar} />

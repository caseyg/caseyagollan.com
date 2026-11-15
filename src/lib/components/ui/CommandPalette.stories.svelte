<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import CommandPalette, { type CommandSection } from './CommandPalette.svelte';
	import Button from './Button.svelte';

	const { Story } = defineMeta({ title: 'Primitives/CommandPalette', component: CommandPalette, parameters: { docs: { story: { height: '560px' } } } });

	const sections: CommandSection[] = [
		{ items: [{ value: 'search', label: 'Search posts, books, and wiki', icon: '🔍', keywords: ['find'] }] },
		{
			label: 'Go to',
			items: [
				{ value: 'home', label: 'Home', icon: '👋', keywords: ['about'] },
				{ value: 'library', label: 'Library', icon: '📚', keywords: ['books'] },
				{ value: 'posts', label: 'Posts', icon: '📡' }
			]
		},
		{
			label: 'Post types',
			items: [
				{ value: 'notes', label: 'Notes', icon: '📝', count: 73 },
				{ value: 'articles', label: 'Articles', icon: '📄', count: 5 },
				{ value: 'likes', label: 'Likes', icon: '♥', count: 912 }
			]
		},
		{
			label: 'Write',
			items: [
				{
					value: 'write',
					label: 'Write a post',
					icon: '✏️',
					items: [
						{ value: 'new-note', label: 'Note', icon: '📝', hint: 'A short post, optionally with photos or a location.' },
						{ value: 'new-article', label: 'Article', icon: '📄', hint: 'A titled post with a summary and Markdown body.' }
					]
				}
			]
		}
	];

	const withResults: CommandSection[] = [
		...sections.slice(1),
		{
			label: 'Posts, books, and wiki',
			items: [
				{ value: 'r1', label: 'The Character of Physical Law', icon: '📚', hint: 'Richard Feynman’s 1964 Messenger Lectures at Cornell…', always: true },
				{ value: 'r3', label: 'Art Under Risk Reading List', icon: '📓', hint: 'A wiki page, on another site, so it is marked ↗.', external: true, always: true },
				{ value: 'r2', label: 'Why Trust a Corporation to Do a Library’s Job?', icon: '♥', hint: 'Liked post. Joanne McNeil, author of “Lurking”…', always: true }
			]
		}
	];

	const links: CommandSection[] = [
		{
			label: 'Go to',
			items: [
				{ value: 'go:/', label: 'Home', icon: '👋', href: '/' },
				{ value: 'go:/library/', label: 'Library', icon: '📚', href: '/library/' },
				{ value: 'go:/posts/', label: 'Posts', icon: '📡', href: '/posts/' }
			]
		}
	];
</script>

<script lang="ts">
	let open = $state(false);
	let openResults = $state(false);
	let openLinks = $state(false);
	let ran = $state('');
</script>

<!-- ⌘K or Ctrl+K opens it from anywhere. Typing filters the commands with a fuzzy match and marks the matched letters; arrows move, Enter runs, Escape clears, then goes back a page, then closes. Built on ui-sdk Dialog and Command. -->
<Story asChild name="Palette">
	<Button variant="secondary" onclick={() => (open = true)}>Open the palette (⌘K)</Button>
	<CommandPalette {sections} bind:open onAction={() => {}} />
</Story>

<!-- Results found elsewhere, such as by the site search, are marked `always` so the palette's own filter keeps them, after the commands that match. `external` marks a page on another site with ↗. Pages add their own sections (see `usePageCommands`). -->
<Story asChild name="With search results">
	<Button variant="secondary" onclick={() => (openResults = true)}>Open with results</Button>
	<CommandPalette sections={withResults} bind:open={openResults} shortcut={null} onAction={() => {}} status="" />
</Story>

<!-- A command with `href` is also a link. A plain click runs it and closes the palette; ⌘/Ctrl-click, Shift-click, a middle click or ⌘/Ctrl-Enter opens it in a new tab and leaves the palette open, so you can open several. -->
<Story asChild name="Links">
	<Button variant="secondary" onclick={() => (openLinks = true)}>Open with links</Button>
	{#if ran}<p>Ran {ran}</p>{/if}
	<CommandPalette sections={links} bind:open={openLinks} shortcut={null} onAction={(value) => (ran = value)} />
</Story>

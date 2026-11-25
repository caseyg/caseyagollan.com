<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import BottomSheet from './BottomSheet.svelte';
	import TextField from './TextField.svelte';

	const { Story } = defineMeta({
		title: 'Primitives/BottomSheet',
		component: BottomSheet,
		parameters: { layout: 'fullscreen', viewport: { defaultViewport: 'mobile1' }, docs: { story: { height: '640px', inline: false } } },
		args: { label: 'Notes', expandLabel: 'Show all notes', collapseLabel: 'Fold the notes down' }
	});

	const notes = Array.from({ length: 24 }, (_, index) => `Note ${index + 1}: something worth keeping about this page.`);
</script>

<!--
	A sheet along the bottom of a phone screen. Folded, it shows a peek and its footer and the page above
	stays usable; pulled up, it shows a header and a scrolling body. Drag or press the grip, press the peek,
	or use the arrow keys on the grip. The body keeps its scroll position while folded, and `restHeight`
	tells the page how much room the folded sheet takes. The table chat docks in one on narrow screens.
-->
{#snippet stage(args: { label: string; expandLabel?: string; collapseLabel?: string }, expanded: boolean)}
	<div class="stage">
		<p class="page">The page behind the sheet</p>
		<div class="dock">
			<BottomSheet {...args} {expanded}>
				{#snippet header()}<strong class="title">Notes</strong>{/snippet}
				{#snippet peek()}{notes.at(-1)}{/snippet}
				{#snippet footer()}<div class="footer"><TextField label="Add a note" placeholder="Something to remember" /></div>{/snippet}
				<ul>{#each notes as note (note)}<li>{note}</li>{/each}</ul>
			</BottomSheet>
		</div>
	</div>
{/snippet}

<Story name="Open">{#snippet template(args)}{@render stage(args, true)}{/snippet}</Story>

<Story name="Folded">{#snippet template(args)}{@render stage(args, false)}{/snippet}</Story>

<style>
	.stage {
		position: relative;
		height: 100vh;
		background: radial-gradient(circle, var(--border) 1px, transparent 1px) 0 0 / 20px 20px;
	}

	.page {
		margin: 0;
		padding: var(--space-6) var(--space-4);
		color: var(--text-muted);
		text-align: center;
	}

	.dock {
		position: absolute;
		inset: auto 0 0;
	}

	.title {
		display: block;
		padding: var(--space-2) var(--space-4);
		font-size: var(--fs-sm);
	}

	ul {
		margin: 0;
		padding: var(--space-3) var(--space-4);
		list-style: none;
		font-size: var(--fs-sm);
	}

	li + li {
		margin-top: var(--space-2);
	}

	.footer {
		padding: var(--space-2) var(--space-3) var(--space-3);
	}
</style>

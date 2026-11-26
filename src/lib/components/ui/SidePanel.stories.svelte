<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Button from './Button.svelte';
	import Chip from './Chip.svelte';
	import SidePanel from './SidePanel.svelte';
	import TextField from './TextField.svelte';

	const { Story } = defineMeta({
		title: 'Primitives/SidePanel',
		component: SidePanel,
		parameters: { layout: 'fullscreen', docs: { story: { height: '560px', inline: false } } },
		args: { label: 'Book details' }
	});

	const lines = Array.from({ length: 30 }, (_, index) => `Line ${index + 1} of something long enough to scroll.`);
</script>

<!--
	A panel down the right side, beneath the site navigation and inset like it. The library's book
	details and the docked chat both use it. The header and footer stay while the body scrolls.
-->
{#snippet page()}
	<div class="page">
		<div class="nav">Site navigation</div>
		<p>The page beside the panel</p>
	</div>
{/snippet}

<!-- Details about something on the page, as in the library. -->
<Story name="Details">
	{#snippet template(args)}
		{@render page()}
		<SidePanel {...args} onclose={() => {}}>
			{#snippet header()}<h2 class="title">Steps to an Ecology of Mind</h2>{/snippet}
			<p>Gregory Bateson</p>
			<p class="chips"><Chip variant="soft" size="sm">1972</Chip><Chip variant="soft" size="sm">545 pages</Chip></p>
			<p>Essays on anthropology, psychiatry, evolution and epistemology.</p>
		</SidePanel>
	{/snippet}
</Story>

<!-- A tool beside the page, as the chat is: tighter, with small buttons before the close button and a footer that stays. -->
<Story name="Compact, with actions and a footer" args={{ label: 'Notes', compact: true }}>
	{#snippet template(args)}
		{@render page()}
		<SidePanel {...args} onclose={() => {}} closeLabel="Close the notes">
			{#snippet header()}<strong>Notes</strong>{/snippet}
			{#snippet actions()}<Button variant="icon" size="sm" icon="plus" label="New note" />{/snippet}
			{#snippet footer()}<TextField label="Add a note" placeholder="Something to remember" />{/snippet}
			{#each lines as line (line)}<p>{line}</p>{/each}
		</SidePanel>
	{/snippet}
</Story>

<Story name="Long content" >
	{#snippet template(args)}
		{@render page()}
		<SidePanel {...args} onclose={() => {}}>
			{#snippet header()}<h2 class="title">Gregory Bateson: Essays for an Ecology of Ideas (Cybernetics &amp; Human Knowing)</h2>{/snippet}
			{#each lines as line (line)}<p>{line}</p>{/each}
		</SidePanel>
	{/snippet}
</Story>

<!-- A window over the corner of the page, which keeps its full width: the chat's Floating setting. -->
<Story name="Floating" args={{ label: 'Notes', compact: true, floating: true }}>
	{#snippet template(args)}
		{@render page()}
		<SidePanel {...args} onclose={() => {}} closeLabel="Close the notes">
			{#snippet header()}<strong>Notes</strong>{/snippet}
			{#snippet footer()}<TextField label="Add a note" placeholder="Something to remember" />{/snippet}
			{#each lines as line (line)}<p>{line}</p>{/each}
		</SidePanel>
	{/snippet}
</Story>

<!-- Two at once: the second reads `--side-panel-offset` and stands beside the first, as a book's details do beside the docked chat. -->
<Story name="Beside another panel">
	{#snippet template(args)}
		{@render page()}
		<SidePanel label="Chat" compact onclose={() => {}}>
			{#snippet header()}<strong>Chat</strong>{/snippet}
			<p>The panel at the edge.</p>
		</SidePanel>
		<SidePanel {...args} onclose={() => {}} style="--side-panel-offset: calc(20rem + var(--nav-inset))">
			{#snippet header()}<h2 class="title">Steps to an Ecology of Mind</h2>{/snippet}
			<p>Gregory Bateson</p>
		</SidePanel>
	{/snippet}
</Story>

<!-- On a phone it lies along the bottom, at most half the screen. -->
<Story name="On a phone" parameters={{ viewport: { defaultViewport: 'mobile1' } }}>
	{#snippet template(args)}
		{@render page()}
		<SidePanel {...args} onclose={() => {}}>
			{#snippet header()}<h2 class="title">Steps to an Ecology of Mind</h2>{/snippet}
			{#each lines as line (line)}<p>{line}</p>{/each}
		</SidePanel>
	{/snippet}
</Story>

<style>
	.page {
		min-height: 100vh;
		padding: calc(var(--nav-lane) + var(--space-5)) var(--space-5);
		color: var(--text-muted);
	}

	.nav {
		position: fixed;
		top: var(--nav-inset);
		right: var(--nav-inset);
		display: flex;
		align-items: center;
		height: var(--nav-height);
		padding: 0 var(--space-3);
		border-radius: var(--radius-sm);
		background: var(--segment);
		color: var(--text-primary);
		font-size: var(--fs-sm);
	}

	.title {
		margin: 0;
		font-size: var(--fs-lg, 1.25rem);
		line-height: var(--lh-snug);
	}

	.chips {
		display: flex;
		gap: var(--space-2);
	}
</style>

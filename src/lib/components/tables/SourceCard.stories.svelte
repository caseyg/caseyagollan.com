<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { cardSize } from '$lib/table-card';
	import type { Block } from '$lib/tables';
	import SourceCard from './SourceCard.svelte';

	const { Story } = defineMeta({ title: 'Tables/SourceCard', component: SourceCard, tags: ['!autodocs'] });

	const picture: Block = { kind: 'link', form: 'card', url: 'https://www.propublica.org/article/smithsonian-overhaul-plan', title: 'Spotted on the D.C. Metro: Trump Staffer Accidentally Reveals Plan for Smithsonian', meta: 'ProPublica', quote: 'If implemented in anything like the proposed form, it would represent an unprecedented assertion of White House control over the Smithsonian.', image: '/library/img/0822359383.jpg', icon: '📖' };
	const tile: Block = { kind: 'link', form: 'card', url: 'https://link.springer.com/article/10.1007/epistemic', title: 'Epistemic assholes', meta: 'link.springer.com · Synthese', quote: 'I will argue that what characterizes epistemic assholes is a unique form of disregard for their epistemic relations.', icon: '📖' };
	const marked: Block = { kind: 'link', form: 'card', url: 'https://kotaku.com/inside-rockstar-games-culture-of-crunch-1829936466', title: 'Inside Rockstar Games’ Culture Of Crunch', meta: 'Kotaku · Jason Schreier', quote: 'Is it possible to make great art without unreasonable sacrifice?', marked: true, icon: '📖' };
	const bare: Block = { kind: 'link', form: 'card', url: 'https://zenodo.org/records/1', title: 'zenodo.org', meta: 'zenodo.org', icon: '📄' };
	const long: Block = { kind: 'raindrop', form: 'card', url: 'https://example.com/a-very-long-title', title: 'Artists Ian Cheng, Simon Denny, Jill Magid, and Julia Weist, alongside art historian Michelle Kuo, in conversation about technology and power', meta: 'artforum.com · A very long byline that runs past the edge of the card', quote: 'The conversation examined the ways technology shapes power, from finance and policing to governance, and how artists can turn these systems and instruments of control into material for their work, at length and in detail, over an afternoon that ran long.', image: '/library/img/0321918622.jpg' };
	const video: Block = { kind: 'link', form: 'card', url: 'https://www.youtube.com/watch?v=abc', title: 'Why Domain-specific Agents Are the Future', meta: 'YouTube', icon: '🎬' };
	const all = [picture, tile, marked, bare, long, video];
</script>

<!-- Cards as a map sets them down, each in the box `cardSize` works out for it: with a picture, with a title tile,
     with Casey's highlight marked, with no quote at all (a blank beats a wrong one), and with everything too long. -->
<Story asChild name="On a map">
	<div class="cards">
		{#each all as block (block.url)}
			<div style="width: {cardSize(block).w}px; height: {cardSize(block).h}px"><SourceCard {block} /></div>
		{/each}
	</div>
</Story>

<!-- With details hidden: no source line, no kind tile. -->
<Story asChild name="Details hidden">
	<div class="cards">
		<div style="width: 280px; height: {cardSize(picture).h}px"><SourceCard block={picture} details={false} /></div>
		<div style="width: 280px; height: {cardSize(tile).h}px"><SourceCard block={tile} details={false} /></div>
	</div>
</Story>

<!-- A picture that fails to load falls back to the title tile. -->
<Story asChild name="Picture missing">
	<div class="cards">
		<div style="width: 280px; height: {cardSize(picture).h}px"><SourceCard block={{ ...picture, image: '/no-such-picture.jpg' }} /></div>
	</div>
</Story>

<style>
	.cards { display: flex; flex-wrap: wrap; align-items: flex-start; gap: var(--space-5); padding: var(--space-5); }
</style>

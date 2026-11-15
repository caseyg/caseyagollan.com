<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import WikiStack from './WikiStack.svelte';
	import WikiArticle from './WikiArticle.svelte';
	import { sampleArticle, samplePane } from '$lib/storybook/wiki';

	const { Story } = defineMeta({
		title: 'Wiki/WikiStack',
		component: WikiStack,
		parameters: { layout: 'fullscreen', docs: { story: { height: '640px', inline: false } } }
	});
</script>

<script lang="ts">
	let opened = $state<string[]>([]);
	let deep = $state<string[]>(['radical-actuarial-action', 'cooper-union', 'composite-financial-index']);
</script>

<!--
  Links between wiki pages open the next page beside the one they are in, as cag.wiki does. Following
  a link from a covered pane closes the panes after it; a page already open is scrolled to instead.
  Screens narrower than two panes follow links as usual (here `always` stacks at any width).
-->
<Story asChild name="Default">
	<WikiStack root={sampleArticle.slug} title={sampleArticle.title} stack={opened} onchange={(next) => (opened = next)} load={samplePane} always>
		<div style="max-width: 40rem; margin: 0 auto; padding: 2rem 1.5rem;"><WikiArticle page={sampleArticle} /></div>
		{#snippet rootPane()}<WikiArticle page={sampleArticle} />{/snippet}
	</WikiStack>
</Story>

<!-- Several pages deep: the earlier ones are covered, each keeping a strip with its title that brings it back. -->
<Story asChild name="Several panes">
	<WikiStack root={sampleArticle.slug} title={sampleArticle.title} stack={deep} onchange={(next) => (deep = next)} load={samplePane} always>
		<WikiArticle page={sampleArticle} />
		{#snippet rootPane()}<WikiArticle page={sampleArticle} />{/snippet}
	</WikiStack>
</Story>

<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import GraphNodeMenu from './GraphNodeMenu.svelte';

	const { Story } = defineMeta({ title: 'Site/GraphNodeMenu', component: GraphNodeMenu, parameters: { docs: { story: { height: '360px' } } } });
</script>

<script lang="ts">
	import SkillsGraph from './SkillsGraph.svelte';
	import { applyAction, curateInsights, emptyCuration, isPinned, type GraphCuration } from '$lib/graph-curation';
	import type { InsightResponse } from '$lib/insight-types';
	import type { Node } from '$lib/data/graph-data';

	let linkMenu: GraphNodeMenu | undefined = $state();
	let topicMenu: GraphNodeMenu | undefined = $state();
	let graphMenu: GraphNodeMenu | undefined = $state();
	let log = $state<string[]>([]);
	const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

	const logged = {
		onPin: (topic: string, url: string) => { log = [`pin ${url} under ${topic}`, ...log]; },
		onUnpin: (topic: string, url: string) => { log = [`unpin ${url} from ${topic}`, ...log]; },
		onBlockUrl: (url: string) => { log = [`block ${url}`, ...log]; },
		onBlockDomain: (url: string) => { log = [`block domain of ${url}`, ...log]; },
		onAttach: async (topic: string, url: string) => {
			await wait(600);
			if (url.includes('fail')) throw new Error('That page couldn’t be reached.');
			log = [`attach ${url} to ${topic}`, ...log];
		}
	};

	const at = (event: MouseEvent) => ({ x: event.clientX, y: event.clientY });

	// The graph story keeps its own curation, as the homepage does in a preview.
	let curation: GraphCuration = $state(emptyCuration());
	const research = new Map<string, InsightResponse>([[
		'Research',
		{ sources: [
			{ url: 'https://www.researchops.community/', title: 'ResearchOps Community', page_age: null, cited_text: 'A global community of research operations practitioners.' },
			{ url: 'https://example.com/a-page-to-hide', title: 'A page to hide', page_age: null, cited_text: null }
		] }
	]]);
	const insights = $derived(curateInsights(research, curation));
	const local = {
		onPin: (topic: string, url: string) => { curation = applyAction(curation, { action: 'pin', topic, source: { url, title: new URL(url).hostname, page_age: null, cited_text: null } }); },
		onUnpin: (topic: string, url: string) => { curation = applyAction(curation, { action: 'unpin', topic, url }); },
		onBlockUrl: (url: string) => { curation = applyAction(curation, { action: 'block-url', url }); },
		onBlockDomain: (url: string) => { curation = applyAction(curation, { action: 'block-domain', url }); },
		onAttach: async (topic: string, url: string) => { curation = applyAction(curation, { action: 'pin', topic, source: { url, title: new URL(url).hostname, page_age: null, cited_text: null } }); }
	};
	function onNodeContextMenu(node: Node, event: MouseEvent) {
		if (node.type === 'citation' && node.url && node.parent) graphMenu?.open({ kind: 'url', topic: node.parent, url: node.url, pinned: isPinned(node.parent, node.url, curation) }, at(event));
		else if (node.type !== 'loading') graphMenu?.open({ kind: 'topic', topic: node.id }, at(event));
	}
</script>

<!-- The owner's menu for a link (citation) node in the homepage graph: always show it under its topic, or never show the link or its whole site. -->
<Story asChild name="Link node">
	<button class="node" oncontextmenu={(event) => { event.preventDefault(); linkMenu?.open({ kind: 'url', topic: 'Research', url: 'https://www.researchops.community/', pinned: false }, at(event)); }}>Right-click this link node</button>
	<button class="node" oncontextmenu={(event) => { event.preventDefault(); linkMenu?.open({ kind: 'url', topic: 'Research', url: 'https://www.researchops.community/', pinned: true }, at(event)); }}>Right-click a pinned link node</button>
	<GraphNodeMenu bind:this={linkMenu} {...logged} />
	<ol class="log">{#each log as line, i (i)}<li>{line}</li>{/each}</ol>
</Story>

<!-- The owner's menu for a topic (text) node: attach a link, fetched now and shown under the topic from then on. Try a URL containing “fail” to see the error. -->
<Story asChild name="Topic node">
	<button class="node" oncontextmenu={(event) => { event.preventDefault(); topicMenu?.open({ kind: 'topic', topic: 'Research' }, at(event)); }}>Right-click this topic node</button>
	<GraphNodeMenu bind:this={topicMenu} {...logged} />
	<ol class="log">{#each log as line, i (i)}<li>{line}</li>{/each}</ol>
</Story>

<!-- The menu on the real graph, focused on Research with two sources. Changes stay in this story, with the note previews show. -->
<Story asChild name="On the graph" parameters={{ docs: { story: { height: '520px' } } }}>
	<div class="graph">
		<SkillsGraph focusNodeId="Research" insightsData={insights} {onNodeContextMenu} />
	</div>
	<GraphNodeMenu bind:this={graphMenu} {...local} note="Preview only: not saved." />
</Story>

<style>
	.node { margin: var(--space-2); padding: var(--space-3) var(--space-4); border: 1px dashed var(--border-strong); border-radius: var(--radius-sm); background: none; color: var(--text-primary); font: inherit; }
	.log { color: var(--text-secondary); font-size: var(--fs-sm); }
	.graph { width: 40rem; height: 30rem; }
</style>

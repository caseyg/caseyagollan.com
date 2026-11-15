<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { MermaidDiagram, Prose } from '.';

	const { Story } = defineMeta({ title: 'Primitives/MermaidDiagram', component: MermaidDiagram, parameters: { layout: 'padded' } });

	const flowchart = `graph LR
	subgraph Intermittently
		H[<strong>Raindrop</strong><br>Links]
		I[<strong>Readwise Reader</strong><br>Articles and Videos]
		J[<strong>Are.na</strong><br>Images and Collections]
	end
	subgraph Obsidian
		direction TB
		subgraph Daily
			O[Daily Note in Obsidian]
			H --> O
			I --> O
			J --> O
		end
		subgraph Weekly
			W[Weeknote in Obsidian]
			O --> W
		end
		subgraph LLMs
			Claude
			W --> Claude --> Q[Quarterly note]
		end
	end`;

	const sequence = `sequenceDiagram
	participant Obsidian
	participant Site as caseyagollan.com
	Obsidian->>Site: Publish a page
	Site->>Site: Build the wiki
	Site-->>Obsidian: Link back`;

	const pie = `pie title Reading this year
	"Novels" : 14
	"Essays" : 9
	"Art books" : 6
	"Poetry" : 3`;

	const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	const article = `<p>A Mermaid code block in a post or wiki page is drawn as a diagram.</p><pre><code class="language-mermaid">${escape(flowchart)}</code></pre><p>Other code blocks stay as code.</p><pre><code class="language-js">console.log('hi');</code></pre>`;
</script>

<!-- A flowchart with groups, from a wiki page. Wide diagrams turn vertical on narrow screens. -->
<Story name="Flowchart" args={{ source: flowchart }} />

<Story name="Sequence" args={{ source: sequence }} />

<!-- Charts take their colors from the series palette. -->
<Story name="Pie" args={{ source: pie }} />

<!-- Source Pele can't draw stays readable as Mermaid text. -->
<Story name="CouldNotDraw" args={{ source: 'graph LR\n  A --> ' }} />

<!-- Prose draws Mermaid code blocks in rendered Markdown, as posts and wiki pages do. -->
<Story asChild name="InProse">
	<div style="max-width: 38rem">
		<Prose>{@html article}</Prose>
	</div>
</Story>

<Story name="GitGraph" args={{ source: 'gitGraph\n  commit\n  branch wiki\n  commit\n  commit\n  checkout main\n  commit\n  merge wiki\n  commit' }} />

<Story name="Timeline" args={{ source: 'timeline\n  title The site\n  2024 : Posts : Library\n  2025 : Wiki\n  2026 : Tables : Diagrams' }} />

<Story name="Mindmap" args={{ source: 'mindmap\n  root((Interests))\n    Art\n      Books\n      Are.na\n    Software\n      Home-cooked\n    Writing' }} />

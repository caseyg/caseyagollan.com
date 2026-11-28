<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { blocks } from '$lib/storybook/fixtures';
	import TableCanvas from './TableCanvas.svelte';
	import TableToolbar from './TableToolbar.svelte';
	import { layoutOp } from '$lib/table-menus';
	import type { TableApi, TableState, TableTool } from './canvas/TableEditor';
	import { VoiceNotes } from '$lib/voice-session.svelte';
	import { COMMANDS, DRAWER, MINDMAP, RAMBLE, scriptedRefine, scriptedSource } from '$lib/storybook/voice';
	import BlockPicker from './BlockPicker.svelte';
	import type { Block } from '$lib/tables';
	import type { LikeThing } from '$lib/table-feed';

	const { Story } = defineMeta({ title: 'Tables/TableCanvas', component: TableCanvas, tags: ['!autodocs'] });
	const sample = Object.values(blocks);
</script>

<script lang="ts">
	let api: TableApi | undefined = $state();
	let view: TableState = $state({ tool: 'select', canUndo: false, canRedo: false, empty: true, placed: [], selection: [], taggable: [] });

	function onready(ready: TableApi) {
		api = ready;
		ready.subscribe((state) => (view = state));
		ready.addBlocks(sample, undefined, { columns: 4, select: false });
		ready.zoomToFit();
	}

	// A voice note that "hears" a script, corrected and placed by a stand-in for the model.
	const voice = new VoiceNotes({ canvas: () => api?.voice, sources: () => [scriptedSource()], refine: scriptedRefine });
	// The same, with requests among the thoughts: an arrow, an edit, a shape and a colour, asked for aloud.
	const commanding = new VoiceNotes({ canvas: () => api?.voice, sources: () => [scriptedSource(COMMANDS)], refine: scriptedRefine });
	// A ramble, as Todoist's Ramble takes one: several things at once, some taken back, ended by saying so.
	const rambling = new VoiceNotes({ canvas: () => api?.voice, sources: () => [scriptedSource(RAMBLE)], refine: scriptedRefine, log: (entry) => console.debug('voice log', JSON.stringify(entry)) });
	const mapping = new VoiceNotes({ canvas: () => api?.voice, sources: () => [scriptedSource(MINDMAP)], refine: scriptedRefine, log: (entry) => console.debug('voice log', JSON.stringify(entry)) });
	mapping.arrange = true;
	function onvoiceready(ready: TableApi) {
		api = ready;
		ready.subscribe((state) => (view = state));
	}

	// The Add drawer by voice: "show similar items" and "get context" open it, and its lines are added by place or by name.
	let adding = $state(false);
	let like = $state<LikeThing[]>([]);
	let source = $state<Block>();
	let pickerTab = $state<'page' | 'similar' | 'recent' | 'site'>();
	let listed: { blocks: Block[]; busy: boolean } = { blocks: [], busy: false };
	const similar = async (): Promise<Block[]> => [blocks.arenaImage, blocks.arenaLink, blocks.raindrop, blocks.arenaText, blocks.note, blocks.article];
	const pieces = async (): Promise<Block[]> => [blocks.image, blocks.socialPost, blocks.quote];
	const asking = new VoiceNotes({
		canvas: () => api?.voice,
		sources: () => [scriptedSource(DRAWER, 110)],
		refine: scriptedRefine,
		log: (entry) => console.debug('voice log', JSON.stringify(entry)),
		drawer: () => ({
			show(list) {
				const selected = api?.selectedThings() ?? [];
				if (list === 'similar' ? !selected.length : !view.selected) return false;
				source = view.selected;
				like = selected;
				pickerTab = list === 'pieces' ? 'page' : 'similar';
				listed = { blocks: [], busy: true };
				adding = true;
				return true;
			},
			open: () => adding,
			async listed() {
				for (let waited = 0; adding && listed.busy && waited < 5000; waited += 100) await new Promise((resolve) => setTimeout(resolve, 100));
				return listed.blocks.map((block) => block.title);
			},
			loaded: () => (adding && !listed.busy ? listed.blocks.map((block) => block.title) : undefined),
			add(places) {
				const picked = places.map((at) => listed.blocks[at]).filter(Boolean);
				api?.addBlocks(picked, undefined, { near: source, select: false, columns: Math.min(picked.length, 4) });
				return picked.length;
			},
			close: () => (adding = false)
		})
	});
	function ondrawerready(ready: TableApi) {
		api = ready;
		ready.subscribe((state) => (view = state));
		ready.addBlocks([blocks.wiki], undefined, { select: false });
	}

	// Markdown as it might be pasted from notes: headings, a list with a list inside it, and formatted text.
	const MARKDOWN = `# Workshop plan

A two-day workshop on **publishing your own site**. Notes from the [planning call](https://example.com/call).

## Before

- Send the invitation
  - Ask what people *already* publish
  - Share the reading list
- Book the room

## During

Each morning starts with a short demo, then people work on their own sites.

### Day one

1. Set up a domain
2. Write a first post

### Day two

- Add \`h-entry\` markup
- Send a webmention

## After

- ~~Print handouts~~ Post the notes
- Ask for feedback`;

	async function onmarkdown(ready: TableApi) {
		api = ready;
		ready.subscribe((state) => (view = state));
		await ready.addMarkdown(MARKDOWN, { x: 0, y: 0 });
		ready.zoomToFit();
	}

	async function onareas(ready: TableApi) {
		const ids = ready.addBlocks(sample.slice(0, 8), undefined, { columns: 4, select: false });
		await ready.perform({ op: 'frame', name: 'Reading', ids: ids.slice(0, 4) });
		ready.zoomToFit();
	}
</script>

<!-- The owner's table: drag blocks around, draw, write notes; double-click a block to open it. -->
<Story asChild name="Editable">
	<div class="frame">
		<TableCanvas document={null} editable {onready} />
		<div class="dock">
			<TableToolbar editable tool={view.tool} canUndo={view.canUndo} canRedo={view.canRedo} status="Saved" geo={view.geo} ontool={(tool, geo) => api?.setTool(tool as TableTool, geo)} onmedia={(files) => void api?.addMedia(files)} selection={view.selection} onlayout={(value, scope) => { const op = layoutOp(value, scope, view.selection.map((item) => item.id)); if (op) void api?.perform(op); }} autoLayout={view.autoLayout} onautolayout={(value) => api?.setAutoLayout(value)} onundo={() => api?.undo()} onredo={() => api?.redo()} onfit={() => api?.zoomToFit()} />
		</div>
	</div>
</Story>

<!-- What visitors see: pan, zoom and open blocks, but nothing moves. -->
<Story asChild name="Read-only">
	<div class="frame">
		<TableCanvas document={null} {onready} />
		<div class="dock"><TableToolbar onfit={() => api?.zoomToFit()} /></div>
	</div>
</Story>

<!-- Areas (frames) group blocks on a lighter patch of the ground. -->
<Story asChild name="Areas">
	<div class="frame">
		<TableCanvas document={null} editable onready={onareas} />
	</div>
</Story>

<!--
	A voice note: press the microphone and the words arrive in a text block, a new one after each pause.
	With "Lay out and connect" on, each finished block is tied to the one it follows and the note becomes a tree.
	Drop one text block on another to combine them; press Enter inside one to split it at the caret.
-->
<Story asChild name="Voice note">
	<div class="frame">
		<TableCanvas document={null} editable onready={onvoiceready} />
		<div class="dock">
			<TableToolbar
				editable tool={view.tool} canUndo={view.canUndo} canRedo={view.canRedo} status="Saved"
				ontool={(tool, geo) => api?.setTool(tool as TableTool, geo)} onundo={() => api?.undo()} onredo={() => api?.redo()} onfit={() => api?.zoomToFit()}
				voice={{ status: voice.status, level: voice.level, notice: voice.notice, correct: voice.correct, arrange: voice.arrange, commands: voice.commands, did: voice.did, thinking: voice.thinking > 0 }}
				onvoice={voice.toggle} onvoicecorrect={(on) => (voice.correct = on)} onvoicearrange={(on) => (voice.arrange = on)} onvoicecommands={(on) => (voice.commands = on)}
			/>
		</div>
	</div>
</Story>

<!--
	Spoken commands: among the thoughts, "connect these two blocks with an arrow", "turn one two three into
	numbers", "draw a circle next to that" and "make the first one blue" are carried out, not written down.
	What each did shows over the microphone; undo takes it back.
-->
<Story asChild name="Voice commands">
	<div class="frame">
		<TableCanvas document={null} editable onready={onvoiceready} />
		<div class="dock">
			<TableToolbar
				editable tool={view.tool} canUndo={view.canUndo} canRedo={view.canRedo} status="Saved"
				ontool={(tool, geo) => api?.setTool(tool as TableTool, geo)} onundo={() => api?.undo()} onredo={() => api?.redo()} onfit={() => api?.zoomToFit()}
				voice={{ status: commanding.status, level: commanding.level, notice: commanding.notice, correct: commanding.correct, arrange: commanding.arrange, commands: commanding.commands, did: commanding.did, thinking: commanding.thinking > 0, usage: commanding.usageView, words: commanding.words }}
				onvoice={commanding.toggle} onvoicecorrect={(on) => (commanding.correct = on)} onvoicearrange={(on) => (commanding.arrange = on)} onvoicecommands={(on) => (commanding.commands = on)} onvoicemeter={(on) => (commanding.meter = on)} onvoicewords={(words) => (commanding.words = words)}
			/>
		</div>
	</div>
</Story>

<!--
	A ramble: "I need to book the room and email the speakers and print the name tags" becomes three notes;
	"actually scratch the name tags" removes the last; "actually make that Friday" changes the one before;
	"that's all" ends the voice note and selects what it added.
-->
<Story asChild name="Voice ramble">
	<div class="frame">
		<TableCanvas document={null} editable onready={onvoiceready} />
		<div class="dock">
			<TableToolbar
				editable tool={view.tool} canUndo={view.canUndo} canRedo={view.canRedo} status="Saved"
				ontool={(tool, geo) => api?.setTool(tool as TableTool, geo)} onundo={() => api?.undo()} onredo={() => api?.redo()} onfit={() => api?.zoomToFit()}
				voice={{ status: rambling.status, level: rambling.level, notice: rambling.notice, correct: rambling.correct, arrange: rambling.arrange, commands: rambling.commands, did: rambling.did, thinking: rambling.thinking > 0, usage: rambling.usageView, words: rambling.words }}
				onvoice={rambling.toggle} onvoicecorrect={(on) => (rambling.correct = on)} onvoicearrange={(on) => (rambling.arrange = on)} onvoicecommands={(on) => (rambling.commands = on)} onvoicemeter={(on) => (rambling.meter = on)} onvoicewords={(words) => (rambling.words = words)}
			/>
		</div>
	</div>
</Story>

<!--
	Thinking aloud as a mind map, with "Lay out and connect" on: "add a sticky" makes an empty one and
	the next thing said is written in it; once "select planning the workshop" has chosen the topic,
	what is said branches from it, side by side, not in a line.
-->
<Story asChild name="Voice mind map">
	<div class="frame">
		<TableCanvas document={null} editable onready={onvoiceready} />
		<div class="dock">
			<TableToolbar
				editable tool={view.tool} canUndo={view.canUndo} canRedo={view.canRedo} status="Saved"
				ontool={(tool, geo) => api?.setTool(tool as TableTool, geo)} onundo={() => api?.undo()} onredo={() => api?.redo()} onfit={() => api?.zoomToFit()}
				voice={{ status: mapping.status, level: mapping.level, notice: mapping.notice, correct: mapping.correct, arrange: mapping.arrange, commands: mapping.commands, did: mapping.did, thinking: mapping.thinking > 0, usage: mapping.usageView, words: mapping.words }}
				onvoice={mapping.toggle} onvoicecorrect={(on) => (mapping.correct = on)} onvoicearrange={(on) => (mapping.arrange = on)} onvoicecommands={(on) => (mapping.commands = on)} onvoicemeter={(on) => (mapping.meter = on)} onvoicewords={(words) => (mapping.words = words)}
			/>
		</div>
	</div>
</Story>

<!--
	The Add drawer by voice: "show similar items" opens it on what is like the note just spoken (or the
	selection), and "get context" on the selected block's page in pieces. While it is listening the lines
	are numbered: "add the second one", "add the first two" and "add new avenues" add from the list, a tap
	still adds one, and "close the drawer" puts it away.
-->
<Story asChild name="Voice drawer">
	<div class="frame tall">
		<TableCanvas document={null} editable onready={ondrawerready} />
		<div class="dock">
			<TableToolbar
				editable tool={view.tool} canUndo={view.canUndo} canRedo={view.canRedo} status="Saved" {adding} onadd={() => (adding = !adding)}
				ontool={(tool, geo) => api?.setTool(tool as TableTool, geo)} onundo={() => api?.undo()} onredo={() => api?.redo()} onfit={() => api?.zoomToFit()}
				voice={{ status: asking.status, level: asking.level, notice: asking.notice, correct: asking.correct, arrange: asking.arrange, commands: asking.commands, did: asking.did, thinking: asking.thinking > 0, usage: asking.usageView, words: asking.words }}
				onvoice={asking.toggle} onvoicecorrect={(on) => (asking.correct = on)} onvoicearrange={(on) => (asking.arrange = on)} onvoicecommands={(on) => (asking.commands = on)} onvoicemeter={(on) => (asking.meter = on)} onvoicewords={(words) => (asking.words = words)}
			/>
		</div>
		{#if adding}
			<div class="picker">
				<BlockPicker
					search={async () => []} {similar} {pieces} {source} {like} placed={view.placed} prefer={pickerTab === 'similar' ? 'similar' : 'page'} bind:tab={pickerTab}
					numbered={asking.listening && asking.commands} onlisted={(found, busy) => (listed = { blocks: found, busy })}
					onadd={(added) => api?.addBlocks(added, undefined, { near: source })} onclose={() => (adding = false)}
				/>
			</div>
		{/if}
	</div>
</Story>

<!--
	Markdown pasted on the table, or a .md file dropped on it, is set down as a tree: a text block per
	heading and list item, an arrow to each from the heading or item it sits under. Paragraphs stay
	together under their heading, and bold, italics, code and links are kept. Paste your own to try it.
-->
<Story asChild name="Markdown tree">
	<div class="frame tall">
		<TableCanvas document={null} editable onready={onmarkdown} />
		<div class="dock">
			<TableToolbar editable tool={view.tool} canUndo={view.canUndo} canRedo={view.canRedo} status="Saved" ontool={(tool, geo) => api?.setTool(tool as TableTool, geo)} selection={view.selection} onlayout={(value, scope) => { const op = layoutOp(value, scope, view.selection.map((item) => item.id)); if (op) void api?.perform(op); }} onundo={() => api?.undo()} onredo={() => api?.redo()} onfit={() => api?.zoomToFit()} />
		</div>
	</div>
</Story>

<style>
	.frame { position: relative; width: 100%; height: 36rem; }
	.frame.tall { height: 44rem; }
	.dock { position: absolute; left: 50%; bottom: var(--space-4); translate: -50% 0; }
	.picker { position: absolute; top: var(--space-4); right: var(--space-4); bottom: 5rem; width: 22rem; }
</style>

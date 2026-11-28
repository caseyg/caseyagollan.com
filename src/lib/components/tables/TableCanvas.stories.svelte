<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { blocks } from '$lib/storybook/fixtures';
	import TableCanvas from './TableCanvas.svelte';
	import TableToolbar from './TableToolbar.svelte';
	import { layoutOp } from '$lib/table-menus';
	import type { TableApi, TableState, TableTool } from './canvas/TableEditor';
	import { VoiceNotes } from '$lib/voice-session.svelte';
	import { COMMANDS, MINDMAP, RAMBLE, scriptedRefine, scriptedSource } from '$lib/storybook/voice';

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
				voice={{ status: commanding.status, level: commanding.level, notice: commanding.notice, correct: commanding.correct, arrange: commanding.arrange, commands: commanding.commands, did: commanding.did, thinking: commanding.thinking > 0, usage: commanding.usageView }}
				onvoice={commanding.toggle} onvoicecorrect={(on) => (commanding.correct = on)} onvoicearrange={(on) => (commanding.arrange = on)} onvoicecommands={(on) => (commanding.commands = on)} onvoicemeter={(on) => (commanding.meter = on)}
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
				voice={{ status: rambling.status, level: rambling.level, notice: rambling.notice, correct: rambling.correct, arrange: rambling.arrange, commands: rambling.commands, did: rambling.did, thinking: rambling.thinking > 0, usage: rambling.usageView }}
				onvoice={rambling.toggle} onvoicecorrect={(on) => (rambling.correct = on)} onvoicearrange={(on) => (rambling.arrange = on)} onvoicecommands={(on) => (rambling.commands = on)} onvoicemeter={(on) => (rambling.meter = on)}
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
				voice={{ status: mapping.status, level: mapping.level, notice: mapping.notice, correct: mapping.correct, arrange: mapping.arrange, commands: mapping.commands, did: mapping.did, thinking: mapping.thinking > 0, usage: mapping.usageView }}
				onvoice={mapping.toggle} onvoicecorrect={(on) => (mapping.correct = on)} onvoicearrange={(on) => (mapping.arrange = on)} onvoicecommands={(on) => (mapping.commands = on)} onvoicemeter={(on) => (mapping.meter = on)}
			/>
		</div>
	</div>
</Story>

<style>
	.frame { position: relative; width: 100%; height: 36rem; }
	.dock { position: absolute; left: 50%; bottom: var(--space-4); translate: -50% 0; }
</style>

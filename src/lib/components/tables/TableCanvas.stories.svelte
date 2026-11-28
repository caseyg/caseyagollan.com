<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { blocks } from '$lib/storybook/fixtures';
	import TableCanvas from './TableCanvas.svelte';
	import TableToolbar from './TableToolbar.svelte';
	import type { TableApi, TableState } from './canvas/TableEditor';
	import { VoiceNotes } from '$lib/voice-session.svelte';
	import { scriptedRefine, scriptedSource } from '$lib/storybook/voice';

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
			<TableToolbar editable tool={view.tool} canUndo={view.canUndo} canRedo={view.canRedo} status="Saved" ontool={(tool) => api?.setTool(tool)} onundo={() => api?.undo()} onredo={() => api?.redo()} onfit={() => api?.zoomToFit()} />
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
				ontool={(tool) => api?.setTool(tool)} onundo={() => api?.undo()} onredo={() => api?.redo()} onfit={() => api?.zoomToFit()}
				voice={{ status: voice.status, level: voice.level, notice: voice.notice, correct: voice.correct, arrange: voice.arrange }}
				onvoice={voice.toggle} onvoicecorrect={(on) => (voice.correct = on)} onvoicearrange={(on) => (voice.arrange = on)}
			/>
		</div>
	</div>
</Story>

<style>
	.frame { position: relative; width: 100%; height: 36rem; }
	.dock { position: absolute; left: 50%; bottom: var(--space-4); translate: -50% 0; }
</style>

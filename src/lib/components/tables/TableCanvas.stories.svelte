<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { blocks } from '$lib/storybook/fixtures';
	import TableCanvas from './TableCanvas.svelte';
	import TableToolbar from './TableToolbar.svelte';
	import { layoutOp } from '$lib/table-menus';
	import type { TableApi, TableState, TableTool } from './canvas/TableEditor';

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

<style>
	.frame { position: relative; width: 100%; height: 36rem; }
	.dock { position: absolute; left: 50%; bottom: var(--space-4); translate: -50% 0; }
</style>

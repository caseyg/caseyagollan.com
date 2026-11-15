<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import TableWireframe from './TableWireframe.svelte';

	const { Story } = defineMeta({ title: 'Tables/TableWireframe', component: TableWireframe, tags: ['!autodocs'] });

	const shape = (id: string, x: number, y: number, w = 240, h = 240) => ({ id, typeName: 'shape', type: 'site-block', x, y, props: { w, h } });
	const arrow = (id: string, from: string, to: string) => [
		{ id, typeName: 'shape', type: 'arrow', x: 0, y: 0, props: {} },
		{ id: `binding:${id}a`, typeName: 'binding', type: 'arrow', fromId: id, toId: from, props: { terminal: 'start' } },
		{ id: `binding:${id}b`, typeName: 'binding', type: 'arrow', fromId: id, toId: to, props: { terminal: 'end' } }
	];
	const records = [shape('shape:a', 0, 240), shape('shape:b', 400, 0), shape('shape:c', 400, 300), shape('shape:d', 720, 120, 180, 300), ...arrow('shape:x', 'shape:a', 'shape:b'), ...arrow('shape:y', 'shape:a', 'shape:c'), ...arrow('shape:z', 'shape:b', 'shape:d')];
	const document = { schema: {}, store: Object.fromEntries(records.map((r) => [r.id, r])) };
</script>

<!-- What a table shows while its canvas loads: its blocks as boxes, where the canvas will draw them. -->
<Story asChild name="Loading table">
	<div class="frame"><TableWireframe {document} /></div>
</Story>

<!-- The same table in a phone-width frame: the margin narrows as the canvas's does. -->
<Story asChild name="Narrow">
	<div class="frame narrow"><TableWireframe {document} /></div>
</Story>

<style>
	.frame {
		position: relative;
		height: 480px;
		background: var(--bg-primary);
	}

	.narrow {
		width: 390px;
		height: 700px;
	}
</style>

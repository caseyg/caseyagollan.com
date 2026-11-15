<script lang="ts">
	import { onMount } from 'svelte';
	import { $getRoot as getRoot } from 'lexical';
	import { getEditor } from 'svelte-lexical';
	import { $isFigureNode as isFigureNode } from './figure-node';

	/**
	 * Draws the figures a post opens with. The editor only draws decorator blocks
	 * when they change, so touch each one once without adding an undo step or an edit.
	 */
	const editor = getEditor();
	onMount(() => {
		editor.update(() => {
			for (const node of getRoot().getChildren()) if (isFigureNode(node)) node.getWritable();
		}, { tag: 'history-merge' });
	});
</script>

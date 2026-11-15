<script lang="ts">
	import { onMount } from 'svelte';
	import { mergeRegister } from '@lexical/utils';
	import { $createNodeSelection as createNodeSelection, $getNodeByKey as getNodeByKey, $getSelection as getSelection, $isNodeSelection as isNodeSelection, $setSelection as setSelection, CLICK_COMMAND, COMMAND_PRIORITY_LOW, KEY_BACKSPACE_COMMAND, KEY_DELETE_COMMAND, type NodeKey } from 'lexical';
	import { getEditor } from 'svelte-lexical';
	import type { Figure } from '$lib/markdown-figure';
	import EditableFigure from './EditableFigure.svelte';
	import { $isFigureNode as isFigureNode } from './figure-node';

	/** The rich editor's view of a FigureNode: edits go back to the node, and from there to Markdown. */
	let { nodeKey, figure }: { nodeKey: NodeKey; figure: Figure } = $props();

	const editor = getEditor();
	let selected = $state(false);

	const withNode = (action: (node: import('./figure-node').FigureNode) => void) =>
		editor.update(() => {
			const node = getNodeByKey(nodeKey);
			if (isFigureNode(node)) action(node);
		});

	function select() {
		editor.update(() => {
			const selection = createNodeSelection();
			selection.add(nodeKey);
			setSelection(selection);
		});
	}

	function remove() {
		withNode(node => {
			const next = node.getNextSibling() ?? node.getPreviousSibling();
			node.remove();
			next?.selectStart();
		});
	}

	onMount(() => {
		const read = () => editor.getEditorState().read(() => getNodeByKey(nodeKey)?.isSelected() ?? false);
		const removeSelected = (event: KeyboardEvent) => {
			const selection = editor.getEditorState().read(() => getSelection());
			if (!read() || !isNodeSelection(selection)) return false;
			event.preventDefault();
			remove();
			return true;
		};
		selected = read();
		return mergeRegister(
			editor.registerUpdateListener(() => { selected = read(); }),
			// Select on the editor's own click, so it does not move the selection back into the text.
			editor.registerCommand(CLICK_COMMAND, event => {
				// The image selects the figure, and its controls keep it selected.
				const target = event.target instanceof Element ? event.target.closest('.image, .controls, .alt') : null;
				if (!target || !editor.getElementByKey(nodeKey)?.contains(target)) return false;
				if (target.matches('.image')) event.preventDefault();
				select();
				return true;
			}, COMMAND_PRIORITY_LOW),
			editor.registerCommand(KEY_BACKSPACE_COMMAND, removeSelected, COMMAND_PRIORITY_LOW),
			editor.registerCommand(KEY_DELETE_COMMAND, removeSelected, COMMAND_PRIORITY_LOW)
		);
	});
</script>

<EditableFigure {figure} {selected} onremove={remove} onchange={changes => withNode(node => node.setFigure(changes))} />

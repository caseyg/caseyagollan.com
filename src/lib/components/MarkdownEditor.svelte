<script lang="ts">
	import { untrack } from 'svelte';
	import { TOGGLE_LINK_COMMAND } from '@lexical/link';
	import { $insertNodes as insertNodes } from 'lexical';
	import { $createFigureNode as createFigureNode } from '$lib/components/editor/figure-node';
	import FigurePlugin from '$lib/components/editor/FigurePlugin.svelte';
	import {
		Composer, ContentEditable, RichTextPlugin, HistoryPlugin, ListPlugin, LinkPlugin, HorizontalRulePlugin, MarkdownShortcutPlugin, OnChangePlugin,
		toggleBold, toggleItalic, toggleStrikethrough, formatParagraph, formatHeading, formatBulletList, formatNumberedList, formatQuote, formatCode, undo, redo,
		type EditorState, type LexicalEditor
	} from 'svelte-lexical';
	import { exportMarkdown, importMarkdown, nodes, transformers } from '$lib/markdown-editor';
	import { Prose } from '$lib/components/ui';

	interface Props {
		/** Markdown source. Rewritten only after an edit, so untouched posts keep their exact source. */
		value: string;
		label: string;
		/** Borderless, for a full-page writing surface such as the composer. */
		bare?: boolean;
	}

	let { value = $bindable(''), label, bare = false }: Props = $props();

	const initialConfig = {
		namespace: 'post-content',
		theme: { text: { strikethrough: 'md-strikethrough' }, list: { nested: { listitem: 'md-nested' } } },
		nodes,
		onError: (error: Error) => { throw error; },
		editorState: () => importMarkdown(untrack(() => value))
	};

	let composer: { getEditor: () => LexicalEditor } | undefined = $state();
	const run = (action: (editor: LexicalEditor) => void) => { if (composer) action(composer.getEditor()); };
	function onChange(state: EditorState) {
		value = exportMarkdown(state);
	}
	function link(editor: LexicalEditor) {
		const url = window.prompt('Link URL (leave empty to remove the link)', 'https://');
		if (url === null) return;
		editor.dispatchCommand(TOGGLE_LINK_COMMAND, /^(https?:\/\/|mailto:|\/)\S+$/.test(url.trim()) ? url.trim() : null);
	}

	function figure(editor: LexicalEditor) {
		const src = window.prompt('Image URL', 'https://')?.trim();
		if (!src || !/^(https?:\/\/|\/)\S+$/.test(src)) return;
		editor.update(() => insertNodes([createFigureNode({ src, alt: '', caption: '', align: 'full' })]));
	}

	// Empty block type: the format buttons always apply, and Text resets.
	const tools: { label: string; title: string; action: (editor: LexicalEditor) => void }[] = [
		{ label: 'B', title: 'Bold', action: toggleBold },
		{ label: 'I', title: 'Italic', action: toggleItalic },
		{ label: 'S', title: 'Strikethrough', action: toggleStrikethrough },
		{ label: 'Link', title: 'Add or remove a link', action: link },
		{ label: 'Figure', title: 'Add an image with a caption', action: figure },
		{ label: 'Text', title: 'Paragraph', action: formatParagraph },
		{ label: 'H2', title: 'Heading', action: editor => formatHeading(editor, '', 'h2') },
		{ label: 'H3', title: 'Subheading', action: editor => formatHeading(editor, '', 'h3') },
		{ label: '• List', title: 'Bulleted list', action: editor => formatBulletList(editor, '') },
		{ label: '1. List', title: 'Numbered list', action: editor => formatNumberedList(editor, '') },
		{ label: '“ Quote', title: 'Quote', action: editor => formatQuote(editor, '') },
		{ label: '{ } Code', title: 'Code block', action: editor => formatCode(editor, '') },
		{ label: '↶', title: 'Undo', action: undo },
		{ label: '↷', title: 'Redo', action: redo }
	];
</script>

<div class="markdown-editor" class:bare>
	<div class="toolbar" role="toolbar" aria-label="Formatting">
		{#each tools as tool (tool.title)}
			<!-- Keep the selection in the editor while a tool is pressed. -->
			<button type="button" title={tool.title} aria-label={tool.title} onmousedown={(event) => event.preventDefault()} onclick={() => run(tool.action)}>{tool.label}</button>
		{/each}
	</div>
	<Composer {initialConfig} bind:this={composer}>
		<Prose class="surface">
			<ContentEditable className="md-editable" ariaLabel={label} ariaMultiline={true} />
		</Prose>
		<RichTextPlugin />
		<HistoryPlugin />
		<ListPlugin />
		<LinkPlugin />
		<HorizontalRulePlugin />
		<FigurePlugin />
		<MarkdownShortcutPlugin {transformers} />
		<OnChangePlugin {onChange} ignoreSelectionChange ignoreHistoryMergeTagChange />
	</Composer>
</div>

<style>
	.markdown-editor {
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		background: var(--surface-sunken);
		transition: border-color var(--duration) var(--ease);
	}

	.markdown-editor:hover,
	.markdown-editor:focus-within {
		border-color: var(--text-primary);
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		padding: var(--space-1);
		border-bottom: 1px solid var(--border);
	}

	.toolbar button {
		min-width: 2rem;
		padding: var(--space-1) var(--space-2);
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-secondary);
		font: inherit;
		font-size: var(--fs-sm);
		line-height: var(--lh-snug);
		cursor: pointer;
	}

	.toolbar button:hover {
		background: var(--surface-2);
		color: var(--text-primary);
	}

	.markdown-editor :global(.md-editable) {
		min-height: 12rem;
		max-height: 70vh;
		overflow-y: auto;
		padding: 0.5rem 0.65rem;
		outline: 0;
		font-size: inherit;
	}

	.markdown-editor.bare {
		border: 0;
		background: transparent;
	}

	.bare .toolbar {
		border-bottom: 1px solid var(--border-subtle);
		padding: 0 0 var(--space-1);
	}

	.bare :global(.md-editable) {
		min-height: 18rem;
		max-height: none;
		padding: var(--space-3) 0;
		line-height: var(--lh-relaxed);
	}

	.markdown-editor :global(.md-strikethrough) {
		text-decoration: line-through;
	}

	.markdown-editor :global(.md-nested) {
		list-style: none;
	}
</style>

<script lang="ts">
	import { Toolbar, ToolbarButton, ToolbarGroup, ToolbarSeparator } from '@ui-sdk/svelte/toolbar';
	import Icon, { type IconName } from '$lib/components/ui/Icon.svelte';
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

	type Tool = { title: string; action: (editor: LexicalEditor) => void; icon?: IconName; text?: string };
	// Empty block type: the format buttons always apply, and Text resets.
	const groups: { label: string; tools: Tool[] }[] = [
		{ label: 'Text style', tools: [
			{ icon: 'bold', title: 'Bold', action: toggleBold },
			{ icon: 'italic', title: 'Italic', action: toggleItalic },
			{ icon: 'strikethrough', title: 'Strikethrough', action: toggleStrikethrough },
			{ icon: 'link', title: 'Add or remove a link', action: link }
		] },
		{ label: 'Block', tools: [
			{ text: '¶', title: 'Paragraph', action: formatParagraph },
			{ text: 'H2', title: 'Heading', action: editor => formatHeading(editor, '', 'h2') },
			{ text: 'H3', title: 'Subheading', action: editor => formatHeading(editor, '', 'h3') },
			{ icon: 'list', title: 'Bulleted list', action: editor => formatBulletList(editor, '') },
			{ icon: 'list-ordered', title: 'Numbered list', action: editor => formatNumberedList(editor, '') },
			{ icon: 'quote', title: 'Quote', action: editor => formatQuote(editor, '') },
			{ icon: 'code', title: 'Code block', action: editor => formatCode(editor, '') }
		] },
		{ label: 'Insert', tools: [{ icon: 'image', title: 'Add an image with a caption', action: figure }] },
		{ label: 'History', tools: [
			{ icon: 'undo', title: 'Undo', action: undo },
			{ icon: 'redo', title: 'Redo', action: redo }
		] }
	];
</script>

<div class="markdown-editor" class:bare>
	<Toolbar class="toolbar" aria-label="Formatting">
		{#each groups as group, i (group.label)}
			{#if i > 0}<ToolbarSeparator class="tool-separator {i === groups.length - 1 ? 'tool-separator--end' : ''}" />{/if}
			<ToolbarGroup class="tool-group" aria-label={group.label}>
				{#each group.tools as tool (tool.title)}
					<!-- Keep the selection in the editor while a tool is pressed. -->
					<ToolbarButton class="tool" title={tool.title} aria-label={tool.title} onmousedown={(event: MouseEvent) => event.preventDefault()} onclick={() => run(tool.action)}>
						{#if tool.icon}<Icon name={tool.icon} size={16} />{:else}{tool.text}{/if}
					</ToolbarButton>
				{/each}
			</ToolbarGroup>
		{/each}
	</Toolbar>
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

	/* One line: on a narrow screen it scrolls sideways instead of wrapping. */
	.markdown-editor :global(.toolbar) {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-1);
		overflow-x: auto;
		border-bottom: 1px solid var(--border);
		scrollbar-width: none;
	}

	.markdown-editor :global(.tool-group) {
		display: flex;
		gap: 1px;
	}

	/* History sits at the end of the row, apart from the formatting. */
	.markdown-editor :global(.tool-separator--end) {
		margin-left: auto;
		visibility: hidden;
	}

	.markdown-editor :global(.tool-separator) {
		flex: none;
		width: 1px;
		height: 1rem;
		background: var(--border);
	}

	.markdown-editor :global(.tool) {
		display: inline-flex;
		flex: none;
		align-items: center;
		justify-content: center;
		width: 1.75rem;
		height: 1.75rem;
		padding: 0;
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-secondary);
		font: inherit;
		font-size: var(--fs-sm);
		line-height: var(--lh-snug);
		cursor: pointer;
	}

	.markdown-editor :global(.tool:hover) {
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

	.bare :global(.toolbar) {
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

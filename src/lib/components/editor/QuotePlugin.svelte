<script lang="ts">
	import { onMount } from 'svelte';
	import { COMMAND_PRIORITY_LOW, INSERT_PARAGRAPH_COMMAND, KEY_BACKSPACE_COMMAND, mergeRegister } from 'lexical';
	import { getEditor } from 'svelte-lexical';
	import { $leaveQuoteOnEnter as leaveQuoteOnEnter, $unquoteOnBackspace as unquoteOnBackspace } from './quote-node';

	/**
	 * Keys for quotes that hold several blocks, matching single-paragraph quotes:
	 * Enter on an empty last line leaves the quote, Backspace at its start unquotes that line.
	 */
	const editor = getEditor();
	onMount(() => mergeRegister(
		editor.registerCommand(INSERT_PARAGRAPH_COMMAND, () => leaveQuoteOnEnter(), COMMAND_PRIORITY_LOW),
		editor.registerCommand(KEY_BACKSPACE_COMMAND, event => {
			if (!unquoteOnBackspace()) return false;
			event?.preventDefault();
			return true;
		}, COMMAND_PRIORITY_LOW)
	));
</script>

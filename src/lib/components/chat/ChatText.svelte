<script lang="ts">
	import { Prose } from '$lib/components/ui';
	import { renderContent } from '$lib/utils/renderContent';
	import { createStreamingRenderer } from '$lib/utils/streamingMarkdown';

	interface Props {
		/** Markdown. */
		text: string;
		/** Still being written: more will be added to the end. */
		streaming?: boolean;
	}

	let { text, streaming = false }: Props = $props();

	// While it streams, only the block being written is rendered again (and its open bold, code and
	// links closed), so each new word costs one paragraph, not the whole stretch. Done, it renders whole.
	const streamBlocks = createStreamingRenderer();
	const blocks = $derived(streaming ? streamBlocks(text) : [renderContent(text, 'markdown')]);
</script>

<!-- One stretch of a message's text. A reply has several when the agent took steps part-way through. -->
<Prose class="text">{#each blocks as block, index (index)}<!-- eslint-disable-next-line svelte/no-at-html-tags -->{@html block}{/each}</Prose>

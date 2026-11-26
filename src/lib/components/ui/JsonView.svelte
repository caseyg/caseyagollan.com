<script module lang="ts">
	export type JsonToken = { text: string; kind?: 'key' | 'string' | 'number' | 'word' };

	const TOKEN = /("(?:[^"\\]|\\.)*"?)(?=(\s*:)?)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/g;

	/**
	 * JSON cut into names, strings, numbers and the punctuation between, without parsing it, so text
	 * that was cut short part-way still reads. Anything that doesn't start like JSON is one plain piece.
	 */
	export function jsonTokens(text: string): JsonToken[] {
		if (!/^\s*[[{]/.test(text)) return [{ text }];
		const tokens: JsonToken[] = [];
		let from = 0;
		for (const match of text.matchAll(TOKEN)) {
			if (match.index > from) tokens.push({ text: text.slice(from, match.index) });
			tokens.push({ text: match[0], kind: match[1] ? (match[2] !== undefined ? 'key' : 'string') : match[3] ? 'number' : 'word' });
			from = match.index + match[0].length;
		}
		if (from < text.length) tokens.push({ text: text.slice(from) });
		return tokens;
	}
</script>

<script lang="ts">
	interface Props {
		/** JSON, or any text: JSON gets its names, strings and numbers told apart. */
		text: string;
		label?: string;
	}

	let { text, label = 'Data' }: Props = $props();
	const tokens = $derived(jsonTokens(text));
</script>

<!-- Data as it came back, in monospace, wrapped to the width it has, scrolling when long. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<pre class="json-view" tabindex="0" aria-label={label}>{#each tokens as token, index (index)}{#if token.kind}<span class={token.kind}>{token.text}</span>{:else}{token.text}{/if}{/each}</pre>

<style>
	.json-view {
		max-height: 16rem;
		margin: 0;
		overflow: auto;
		color: var(--text-muted);
		font-family: var(--font-mono);
		font-size: var(--fs-xs);
		line-height: var(--lh-normal);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.json-view:focus-visible {
		outline: var(--focus-ring);
		outline-offset: 2px;
	}

	/* Told apart by weight and brightness: the site's palette has one hue. */
	.key {
		color: var(--text-primary);
		font-weight: var(--fw-semibold);
	}

	.string {
		color: var(--text-secondary);
	}

	.number,
	.word {
		color: var(--text-primary);
		font-style: italic;
	}
</style>

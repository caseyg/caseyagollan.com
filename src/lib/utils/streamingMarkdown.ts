import { marked } from 'marked';
import remend from 'remend';
import { renderContent } from './renderContent';

/**
 * Renders Markdown that is still arriving, such as a chat reply, one top-level block at a time.
 *
 * Re-rendering a whole reply on every few new characters parses and sanitizes it from the top each
 * time, and replaces all of its DOM. Here each finished block (a paragraph, list, code fence, table)
 * is rendered once and kept, so only the block being written is parsed again, and only its DOM
 * changes. The unfinished block has its open bold, code and links closed (Streamdown's `remend`).
 *
 * Once the text is done, render it whole with `renderContent` instead: blocks rendered alone can't
 * see reference-style link definitions elsewhere in the text.
 */
export function createStreamingRenderer(limit = 200) {
	const cache = new Map<string, string>();
	const render = (raw: string) => {
		let html = cache.get(raw);
		if (html === undefined) {
			html = renderContent(raw, 'markdown');
			if (cache.size >= limit) cache.clear();
			cache.set(raw, html);
		}
		return html;
	};

	// Text only ever grows while it streams, so the finished blocks are kept, and only the text after
	// them is read again. Anything else (a rewrite, another message) starts over.
	let source = '';
	let stableEnd = 0;
	let stable: string[] = [];

	return (content: string): string[] => {
		if (!content) return [];
		if (!content.startsWith(source)) {
			stableEnd = 0;
			stable = [];
		}
		source = content;
		const tokens = marked.lexer(content.slice(stableEnd));
		// The last block may still grow, so it's closed up and never kept.
		let last = tokens.length - 1;
		while (last >= 0 && tokens[last].type === 'space') last--;
		for (let index = 0; index < last; index++) {
			const token = tokens[index];
			stableEnd += token.raw.length;
			if (token.type === 'space' || token.type === 'def') continue;
			const html = render(token.raw);
			if (html) stable.push(html);
		}
		const blocks = stable.slice();
		if (last >= 0) {
			const tail = tokens.slice(last).map((token) => token.raw).join('');
			const html = renderContent(remend(tail), 'markdown');
			if (html) blocks.push(html);
		}
		return blocks;
	};
}

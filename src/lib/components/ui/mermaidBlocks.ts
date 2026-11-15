import { mount, unmount } from 'svelte';
import MermaidDiagram from './MermaidDiagram.svelte';

const BLOCKS = 'pre > code.language-mermaid';

/**
 * Draws the Mermaid code blocks in rendered Markdown with MermaidDiagram, as Prose does for every
 * post and wiki page. The diagram goes inside the block's own `<pre>`, so `{@html}` still owns the
 * nodes it made and can swap the page out; a block that leaves the page takes its diagram with it.
 */
export function mermaidBlocks(node: HTMLElement) {
	const drawn = new Map<HTMLElement, ReturnType<typeof mount>>();

	function scan() {
		for (const [pre, diagram] of drawn) {
			if (pre.isConnected && node.contains(pre)) continue;
			unmount(diagram);
			drawn.delete(pre);
		}
		for (const code of node.querySelectorAll<HTMLElement>(BLOCKS)) {
			const pre = code.parentElement!;
			if (drawn.has(pre)) continue;
			const source = code.textContent ?? '';
			if (!source.trim()) continue;
			code.hidden = true;
			pre.classList.add('mermaid-block');
			drawn.set(pre, mount(MermaidDiagram, { target: pre, props: { source } }));
		}
	}

	scan();
	// Diagrams redraw themselves as they resize; only changes outside them can add or remove blocks.
	const observer = new MutationObserver((records) => {
		if (records.some((record) => !(record.target as Element).closest?.('.mermaid-block'))) scan();
	});
	observer.observe(node, { childList: true, subtree: true });
	return () => {
		observer.disconnect();
		for (const diagram of drawn.values()) unmount(diagram);
		drawn.clear();
	};
}

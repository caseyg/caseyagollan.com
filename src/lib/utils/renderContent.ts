import { marked } from 'marked';
import { fromHtml } from 'hast-util-from-html';
import { toHtml } from 'hast-util-to-html';
import type { Element, Root, RootContent } from 'hast';
import { sanitizePublishingHtml } from './sanitizeHtml';
import { SITE_FEEDS, SITE_URL } from '$lib/feeds';

// Configure Markdown formatting; the final HTML is sanitized below.
marked.setOptions({
	gfm: true,
	breaks: true
});

// Recognize full social handles before GFM treats their suffix as an email address.
// Leave them as text until the parsed-tree pass can respect link/code boundaries.
marked.use({ extensions: [{
 name: 'socialHandle', level: 'inline',
 start: (source: string) => source.indexOf('@'),
 tokenizer(source: string) {
  const match = /^@(?:[a-zA-Z0-9_]+@[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|[a-zA-Z0-9][a-zA-Z0-9.-]*\.bsky\.social)/.exec(source);
  if (match) return { type: 'socialHandle', raw: match[0] };
 },
 renderer: (token) => escapeText(token.raw)
}] });

// oEmbed patterns for common providers
const OEMBED_PATTERNS: Array<{
	pattern: RegExp;
	getEmbed: (match: RegExpMatchArray) => string;
	/** Only a link on a line of its own embeds; in a sentence it stays a link. */
	block?: boolean;
}> = [
	// YouTube - various URL formats
	{
		pattern: /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})(?:\S*)?/g,
		getEmbed: (match) => {
			const videoId = match[1];
			return `<div class="embed embed-video"><iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;
		}
	},
	// A table on this site, drawn read-only; the link stays for readers that drop frames.
	{
		pattern: /^https:\/\/(?:www\.)?caseyagollan\.com\/tables\/([a-z0-9-]{4,40})\/?$/g,
		getEmbed: (match) => {
			const href = `https://caseyagollan.com/tables/${match[1]}`;
			return `<div class="embed embed-table"><iframe src="${href}/embed" title="A table by Casey Gollan" loading="lazy"></iframe><p class="embed-caption"><a href="${href}">Open the table</a></p></div>`;
		}
	},
	// The site's subscribe page on a line of its own: a sentence with every way to follow, which
	// Prose draws as the signup form and feed links (subscribeEmbeds). Feeds and email keep the sentence.
	{
		pattern: /^https:\/\/(?:www\.)?caseyagollan\.com\/subscribe\/?$/g,
		block: true,
		getEmbed: () => {
			const feeds = SITE_FEEDS.map((feed) => `<a href="${SITE_URL}${feed.path}">${feed.label}</a>`);
			const list = feeds.length > 1 ? `${feeds.slice(0, -1).join(', ')} or ${feeds.at(-1)}` : feeds.join('');
			return `<div class="embed embed-subscribe"><p><a href="${SITE_URL}/subscribe/">Get new posts by email</a>, or follow with ${list}.</p></div>`;
		}
	},
	// Vimeo
	{
		pattern: /(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(\d+)(?:\S*)?/g,
		getEmbed: (match) => {
			const videoId = match[1];
			return `<div class="embed embed-video"><iframe src="https://player.vimeo.com/video/${videoId}" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;
		}
	}
];

// Mastodon handle pattern: @user@instance.tld
const MASTODON_HANDLE_PATTERN = /(?<![a-zA-Z0-9])@([a-zA-Z0-9_]+)@([a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(?![^<]*>|[^<>]*<\/a>)/g;

// Bluesky handle pattern: @user.bsky.social or @handle.tld
const BLUESKY_HANDLE_PATTERN = /(?<![a-zA-Z0-9@])@([a-zA-Z0-9][a-zA-Z0-9.-]*\.bsky\.social)(?![^<]*>|[^<>]*<\/a>)/g;

/**
 * Process oEmbed URLs in content
 */
function processOembeds(content: string, inline = false): string {
	let result = content;

	for (const { pattern, getEmbed, block } of OEMBED_PATTERNS) {
		if (block && inline) continue;
		pattern.lastIndex = 0;
		result = result.replace(pattern, (fullMatch, ...groups) => {
			// Check if this URL is already inside a link or other HTML
			const beforeMatch = result.substring(0, result.indexOf(fullMatch));
			const inTag = /<[^>]*$/.test(beforeMatch);
			if (inTag) return fullMatch;

			return getEmbed([fullMatch, ...groups] as RegExpMatchArray);
		});
	}

	return result;
}

/**
 * Auto-link Mastodon handles (@user@instance.tld → https://instance.tld/@user)
 */
function autoLinkMastodonHandles(content: string): string {
	return content.replace(MASTODON_HANDLE_PATTERN, (_match, user, instance) => {
		const url = `https://${instance}/@${user}`;
		return `<a href="${url}" target="_blank" rel="noopener">@${user}@${instance}</a>`;
	});
}

/**
 * Auto-link Bluesky handles (@user.bsky.social → https://bsky.app/profile/user.bsky.social)
 */
function autoLinkBlueskyHandles(content: string): string {
	return content.replace(BLUESKY_HANDLE_PATTERN, (_match, handle) => {
		const url = `https://bsky.app/profile/${handle}`;
		return `<a href="${url}" target="_blank" rel="noopener">@${handle}</a>`;
	});
}

/** Enhance parsed text without modifying Markdown destinations, HTML attributes, or code. */
function enhanceMarkdown(node: Root | Element): void {
 if (node.type === 'element' && ['a', 'code', 'pre', 'script', 'style', 'iframe'].includes(node.tagName)) return;
 node.children = node.children.flatMap((child): RootContent[] => {
  if (child.type === 'element') {
   // An embed on a line of its own takes the paragraph's place rather than sitting inside it.
   const only = child.tagName === 'p' && child.children.length === 1 ? child.children[0] : undefined;
   if (only?.type === 'element' && only.tagName === 'a') {
    const embedded = embedLink(only, false);
    if (embedded) return embedded;
   }
   // Marked autolinks bare URLs. Embed those while preserving descriptive link labels.
   if (child.tagName === 'a') {
    const embedded = embedLink(child);
    if (embedded) return embedded;
   }
   enhanceMarkdown(child);
  } else if (child.type === 'text') {
   const escaped = escapeText(child.value);
   const linked = autoLinkBlueskyHandles(autoLinkMastodonHandles(escaped));
   if (linked !== escaped) return fromHtml(linked, { fragment: true }).children;
  }
  return [child];
 });
}

/** The embed for a bare autolinked URL, or nothing for a link with its own label. */
function embedLink(link: Element, inline = true): RootContent[] | undefined {
 const [text] = link.children;
 if (link.children.length !== 1 || text.type !== 'text' || text.value !== link.properties.href) return undefined;
 const embedded = processOembeds(text.value, inline);
 return embedded === text.value ? undefined : fromHtml(embedded, { fragment: true }).children;
}

function escapeText(value: string): string {
 return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Autolink original text segments, never interpreting escaped HTML as markup. */
function renderPlainText(content: string): string {
 let html = '';
 let offset = 0;
 for (const match of content.matchAll(/https?:\/\/[^\s<>"']+/g)) {
  const index = match.index!;
  html += escapeText(content.slice(offset, index));
  let url = match[0].replace(/[.,!?;:]+$/, '');
  // A closing bracket belongs to the URL only when balanced within it.
  while (/[)\]}]$/.test(url)) {
   const close = url.at(-1)!;
   const open = close === ')' ? '(' : close === ']' ? '[' : '{';
   if (url.split(close).length <= url.split(open).length) break;
   url = url.slice(0, -1).replace(/[.,!?;:]+$/, '');
  }
  let valid = false;
  try { const parsed = new URL(url); valid = (parsed.protocol === 'http:' || parsed.protocol === 'https:') && !!parsed.hostname; } catch { /* Leave malformed URLs literal. */ }
  html += valid ? `<a href="${escapeText(url)}">${escapeText(url)}</a>${escapeText(match[0].slice(url.length))}` : escapeText(match[0]);
  offset = index + match[0].length;
 }
 html += escapeText(content.slice(offset));
 return sanitizePublishingHtml(html.replace(/\r?\n/g, '<br>'));
}

/**
 * Render content with markdown, auto-linking, and oEmbed support
 *
 * @param content - Raw content string (may contain markdown, URLs, etc.)
 * @returns HTML string ready for rendering with {@html}
 */
export function renderContent(content: string, format: 'text' | 'html' | 'markdown' = 'markdown'): string {
	if (!content) return '';
	if (format === 'html') return sanitizePublishingHtml(content);
	if (format === 'text') return renderPlainText(content);

	// Parse Markdown first so explicit links, images, and code keep their structure.
 const tree = fromHtml(marked.parse(content, { async: false }) as string, { fragment: true });
 enhanceMarkdown(tree);
 const html = toHtml(tree);

	return sanitizePublishingHtml(html);
}

/**
 * Render content synchronously (for use in components)
 */
export function renderContentSync(content: string, format: 'text' | 'html' | 'markdown' = 'markdown'): string {
	return renderContent(content, format);
}

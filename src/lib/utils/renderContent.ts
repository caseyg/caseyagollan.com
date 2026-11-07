import { marked } from 'marked';
import { fromHtml } from 'hast-util-from-html';
import { toHtml } from 'hast-util-to-html';
import type { Element, Root, RootContent } from 'hast';
import { sanitizePublishingHtml } from './sanitizeHtml';

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
}> = [
	// YouTube - various URL formats
	{
		pattern: /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})(?:\S*)?/g,
		getEmbed: (match) => {
			const videoId = match[1];
			return `<div class="embed embed-video"><iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;
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
function processOembeds(content: string): string {
	let result = content;

	for (const { pattern, getEmbed } of OEMBED_PATTERNS) {
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
   // Marked autolinks bare URLs. Embed those while preserving descriptive link labels.
   if (child.tagName === 'a' && child.children.length === 1 && child.children[0].type === 'text' && child.children[0].value === child.properties.href) {
    const url = child.children[0].value;
    const embedded = processOembeds(url);
    if (embedded !== url) return fromHtml(embedded, { fragment: true }).children;
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

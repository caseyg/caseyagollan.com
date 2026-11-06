import { marked } from 'marked';
import { sanitizePublishingHtml } from './sanitizeHtml';

// Configure Markdown formatting; the final HTML is sanitized below.
marked.setOptions({
	gfm: true,
	breaks: true
});

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

// URL pattern for auto-linking plain URLs
const URL_PATTERN = /(?<!["'=])(https?:\/\/[^\s<>[\]()]+)(?![^<]*>|[^<>]*<\/a>)/g;

// Mastodon handle pattern: @user@instance.tld
const MASTODON_HANDLE_PATTERN = /(?<![a-zA-Z0-9])@([a-zA-Z0-9_]+)@([a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(?![^<]*>|[^<>]*<\/a>)/g;

// Bluesky handle pattern: @user.bsky.social or @handle.tld
const BLUESKY_HANDLE_PATTERN = /(?<![a-zA-Z0-9@])@([a-zA-Z0-9][a-zA-Z0-9.-]*\.bsky\.social)(?![^<]*>|[^<>]*<\/a>)/g;

/**
 * Extract domain from URL for display
 */
function getDomain(url: string): string {
	try {
		const parsed = new URL(url);
		return parsed.hostname.replace(/^www\./, '');
	} catch {
		return url;
	}
}

/**
 * Check if a URL matches an oEmbed pattern
 */
function matchesOembedPattern(url: string): boolean {
	return OEMBED_PATTERNS.some(({ pattern }) => {
		pattern.lastIndex = 0;
		return pattern.test(url);
	});
}

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

/**
 * Auto-link plain URLs that aren't already linked and aren't oEmbed-able
 */
function autoLinkUrls(content: string): string {
	return content.replace(URL_PATTERN, (url) => {
		// Skip if it matches an oEmbed pattern (those get embedded instead)
		if (matchesOembedPattern(url)) {
			return url;
		}
		const domain = getDomain(url);
		return `<a href="${url}" target="_blank" rel="noopener">${domain}</a>`;
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

	// Step 1: Process oEmbeds first (before markdown to avoid interference)
	let processed = processOembeds(content);

	// Step 2: Auto-link social handles (before URLs to avoid conflicts)
	processed = autoLinkMastodonHandles(processed);
	processed = autoLinkBlueskyHandles(processed);

	// Step 3: Auto-link remaining URLs
	processed = autoLinkUrls(processed);

	// Step 4: Run through marked for markdown processing
	const html = marked.parse(processed, { async: false }) as string;

	return sanitizePublishingHtml(html);
}

/**
 * Render content synchronously (for use in components)
 */
export function renderContentSync(content: string, format: 'text' | 'html' | 'markdown' = 'markdown'): string {
	return renderContent(content, format);
}

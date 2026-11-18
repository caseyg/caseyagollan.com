export type Section = 'home' | 'library' | 'posts' | 'wiki' | 'tables' | 'chat';

/**
 * The site's top-level sections, in the order the nav shows them. The nav and the ⌘K palette's
 * "Go to" both read this, so a new section shows up in both.
 */
// The same segments in the same order on every page, so each one stays where it was last time.
export const SECTIONS: { id: Section; href: string; label: string; icon: string; keywords: string[] }[] = [
	{ id: 'home', href: '/', label: 'Home', icon: '👋', keywords: ['about', 'bio', 'casey'] },
	{ id: 'library', href: '/library/', label: 'Library', icon: '📚', keywords: ['books', 'reading', 'graph'] },
	{ id: 'posts', href: '/posts/', label: 'Posts', icon: '📡', keywords: ['feed', 'blog', 'notes'] },
	{ id: 'wiki', href: '/wiki/', label: 'Wiki', icon: '📓', keywords: ['cag.wiki', 'pages', 'garden'] },
	{ id: 'tables', href: '/tables/', label: 'Tables', icon: '🗂️', keywords: ['canvas', 'boards', 'collections', 'tldraw'] },
	{ id: 'chat', href: '/chat', label: 'Chat', icon: '💬', keywords: ['ai', 'assistant', 'ask', 'agent'] }
];

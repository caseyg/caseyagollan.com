/** A published page as Obsidian Publish serves it, before any rendering. */
export interface WikiSourcePage {
	/** Path in the vault, such as `Art Under Risk.md`. */
	path: string;
	/** The page's address on cag.wiki. */
	url: string;
	title: string;
	aliases: string[];
	tags: string[];
	year: string[];
	markdown: string;
}

/** Everything the build pulls from cag.wiki. */
export interface WikiVault {
	fetchedAt: string;
	pages: WikiSourcePage[];
	/** Vault paths of published files that are not pages, such as images. */
	attachments: string[];
	/** Vault path of the page cag.wiki opens on. */
	home?: string;
}

export interface WikiHeading {
	id: string;
	text: string;
	level: number;
}

export interface WikiField {
	name: string;
	html: string;
}

/** A page ready to show on the site. */
export interface WikiPage {
	slug: string;
	title: string;
	/** The same page on cag.wiki. */
	url: string;
	aliases: string[];
	tags: string[];
	year?: string;
	/** Details the page gives as Dataview `key:: value` lines, such as its author, with rendered values. */
	fields: WikiField[];
	html: string;
	/** Plain text from the top of the page, for previews and descriptions. */
	excerpt: string;
	headings: WikiHeading[];
	/** Slugs of the pages this one links to or embeds. */
	links: string[];
	/** Slugs of the pages that link here. */
	backlinks: string[];
}

/** The fields lists, menus and graphs need, without the page body. */
export type WikiPageSummary = Pick<WikiPage, 'slug' | 'title' | 'tags' | 'excerpt'> & { links: number; backlinks: number };

export interface WikiGraphNode {
	slug: string;
	title: string;
	/** Links in and out, which sizes the node. */
	degree: number;
}

export interface WikiGraphLink {
	source: string;
	target: string;
}

export interface WikiGraphData {
	nodes: WikiGraphNode[];
	links: WikiGraphLink[];
}

/** Lookup keys (lowercased names, permalinks, aliases) to slugs, so links written any way find their page. */
export type WikiManifest = Record<string, string>;

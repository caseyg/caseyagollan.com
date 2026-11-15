/** What a hover preview shows, served at /wiki/<slug>/preview.json. */
export interface WikiPreview {
	slug: string;
	title: string;
	html: string;
	tags: string[];
}

const previews = new Map<string, Promise<WikiPreview | null>>();

/** The slug a link leads to, when it is a wiki page on this site. */
export function previewSlug(link: HTMLAnchorElement): string | null {
	if (link.origin !== location.origin) return null;
	const match = /^\/wiki\/(.+?)\/?$/.exec(decodeURI(link.pathname));
	return match ? match[1] : null;
}

/** One request per page, shared by every link to it. Never rejects. */
export function loadPreview(slug: string): Promise<WikiPreview | null> {
	let preview = previews.get(slug);
	if (!preview) {
		preview = fetch(`/wiki/${slug}/preview.json`)
			.then((response) => (response.ok ? (response.json() as Promise<WikiPreview>) : null))
			.catch(() => null);
		previews.set(slug, preview);
	}
	return preview;
}

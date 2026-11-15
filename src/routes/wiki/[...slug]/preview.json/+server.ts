import { error, json } from '@sveltejs/kit';
import { getWiki } from '$lib/server/wiki';
import { previewHtml } from '$lib/wiki/build';
import type { WikiPreview } from '$lib/wiki/preview';
import type { EntryGenerator, RequestHandler } from './$types';

export const prerender = true;
export const entries: EntryGenerator = () => getWiki().pages.map((page) => ({ slug: page.slug }));

/** The top of a page, for the card that opens when a link to it is hovered. */
export const GET: RequestHandler = ({ params }) => {
	const page = getWiki().bySlug.get(params.slug);
	if (!page) error(404, 'Not in the wiki');
	return json({ slug: page.slug, title: page.title, tags: page.tags, html: previewHtml(page.html) } satisfies WikiPreview);
};

import { error, json } from '@sveltejs/kit';
import { getWiki } from '$lib/server/wiki';
import { summarize } from '$lib/wiki/build';
import type { WikiPaneData } from '$lib/wiki/stack';
import type { EntryGenerator, RequestHandler } from './$types';

export const prerender = true;
export const entries: EntryGenerator = () => getWiki().pages.map((page) => ({ slug: page.slug }));

/** A whole page, for a pane stacked beside the one being read. */
export const GET: RequestHandler = ({ params }) => {
	const wiki = getWiki();
	const page = wiki.bySlug.get(params.slug);
	if (!page) error(404, 'Not in the wiki');
	const { slug, title, url, tags, year, fields, html } = page;
	const backlinks = page.backlinks.map((other) => {
		const { slug, title, excerpt } = summarize(wiki.bySlug.get(other)!);
		return { slug, title, excerpt };
	});
	return json({ slug, title, url, tags, year, fields, html, backlinks } satisfies WikiPaneData);
};

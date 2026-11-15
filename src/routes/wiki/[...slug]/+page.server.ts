import { error } from '@sveltejs/kit';
import { getWiki } from '$lib/server/wiki';
import { neighborhood, summarize } from '$lib/wiki/build';
import { layoutGraph } from '$lib/wiki/graph-layout';
import type { EntryGenerator, PageServerLoad } from './$types';

export const entries: EntryGenerator = () => getWiki().pages.map((page) => ({ slug: page.slug }));

export const load: PageServerLoad = ({ params }) => {
	const wiki = getWiki();
	const page = wiki.bySlug.get(params.slug);
	if (!page) error(404, 'This page isn’t in the wiki');
	return {
		page,
		backlinks: page.backlinks.map((slug) => summarize(wiki.bySlug.get(slug)!)),
		graph: layoutGraph(neighborhood(wiki.graph, page.slug, 1), { center: page.slug })
	};
};

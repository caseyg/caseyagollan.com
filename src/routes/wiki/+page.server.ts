import { getWiki } from '$lib/server/wiki';
import { summarize } from '$lib/wiki/build';
import { layoutGraph } from '$lib/wiki/graph-layout';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	const wiki = getWiki();
	return {
		home: wiki.home,
		pages: wiki.pages.map(summarize),
		graph: layoutGraph(wiki.graph)
	};
};

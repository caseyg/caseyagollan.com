import { buildWiki, neighborhood, previewHtml, summarize } from '$lib/wiki/build';
import { layoutGraph } from '$lib/wiki/graph-layout';
import type { WikiSourcePage, WikiVault } from '$lib/wiki/types';
import type { WikiPreview } from '$lib/wiki/preview';
import type { WikiPaneData } from '$lib/wiki/stack';

const page = (title: string, markdown: string, extra: Partial<WikiSourcePage> = {}): WikiSourcePage => ({
	path: `${title}.md`,
	url: `https://cag.wiki/${title.toLowerCase().replace(/\W+/g, '-')}`,
	title,
	aliases: [],
	tags: [],
	year: [],
	markdown,
	...extra
});

/** A small wiki in the shape cag.wiki publishes, with each kind of Obsidian syntax the browser renders. */
export const sampleVault: WikiVault = {
	fetchedAt: '2026-11-15T00:00:00.000Z',
	home: 'Home.md',
	attachments: ['Attachments/cairn.jpg'],
	pages: [
		page('Home', '# Home\n\nWelcome to the wiki. Start with [[Art Under Risk]], [[Research Ops|research ops]] or [[Organizing]].\n\n## Elsewhere\n\n[[Federated Wiki]] was the first home for these notes.'),
		page(
			'Art Under Risk',
			'For the past near-decade I\'ve been thinking through a constellation of topics under the banner of **Art Under Risk**.\n\nThe project is a call to action for [[Radical Actuarial Action]], and grew out of [[Cooper Union]].[^1]\n\n## Concepts\n\n- [[Composite Financial Index]]\n- [[Organizing#Governance|Governance]]\n- ==Institutional risk== as a design material\n\n## Reading\n\n![[Organizing#Governance]]\n\n[^1]: Where I studied, and where the crisis began.',
			{ tags: ['🏷️/idea', 'art'], year: ['2019'] }
		),
		page('Radical Actuarial Action', 'Actuarial science, turned toward the people it usually counts. Part of [[Art Under Risk]].\n\n![[cairn.jpg]]', { tags: ['🏷️/idea'] }),
		page('Cooper Union', 'A school that was free for 150 years. See [[Art Under Risk]] and [[Composite Financial Index]].', { tags: ['art'] }),
		page('Composite Financial Index', 'A single score for an institution\'s financial health, used by accreditors. [[Cooper Union]] scored low in 2011.'),
		page('Organizing', 'Notes on working together.\n\n## Governance\n\nWho decides, and how decisions are written down. Related: [[Research Ops]].\n\n## Facilitation\n\nRunning a meeting so everyone can speak.'),
		page(
			'Nielsen Model of ReOps',
			'---\npublish: true\n---\n\n%%%\nauthor:: [[Kate Kaplan]]\nsource:: [[Research Ops]]\n\n# Nielsen Model of ReOps\n\n%% A note to self that stays hidden. %%\n\n[ResearchOps 101](https://www.nngroup.com/articles/research-ops-101/)\n\n> It outlines 6 common focus areas of ResearchOps.',
			{ aliases: [] }
		),
		page('Research Ops', 'The people, tools and processes that help research happen. Linked from [[Home]].', { tags: ['🔍/ops'], aliases: ['ReOps'] })
	]
};

export const sampleWiki = buildWiki(sampleVault);
export const sampleArticle = sampleWiki.bySlug.get('art-under-risk')!;
export const sampleSummaries = sampleWiki.pages.map(summarize);
export const sampleWholeGraph = layoutGraph(sampleWiki.graph);
export const sampleLocalGraph = layoutGraph(neighborhood(sampleWiki.graph, 'art-under-risk', 1), { center: 'art-under-risk' });

export const samplePreviews: Record<string, WikiPreview> = Object.fromEntries(
	sampleWiki.pages.map((wikiPage) => [wikiPage.slug, { slug: wikiPage.slug, title: wikiPage.title, tags: wikiPage.tags, html: previewHtml(wikiPage.html) }])
);

/** Sample pages as stacked panes load them, by slug. */
export async function samplePane(slug: string): Promise<WikiPaneData | null> {
	const found = sampleWiki.bySlug.get(slug);
	if (!found) return null;
	const { title, url, tags, year, fields, html } = found;
	return { slug, title, url, tags, year, fields, html, backlinks: found.backlinks.map((other) => summarize(sampleWiki.bySlug.get(other)!)) };
}

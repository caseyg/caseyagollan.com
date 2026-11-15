import { expect, test } from 'bun:test';
import { buildWiki, neighborhood, previewHtml } from '../src/lib/wiki/build';
import { layoutGraph } from '../src/lib/wiki/graph-layout';
import { localizeWikiLinks, resolveWikiUrl, wikiManifest, wikiSlug } from '../src/lib/wiki/resolve';
import { sampleVault } from '../src/lib/storybook/wiki';
import type { WikiSourcePage, WikiVault } from '../src/lib/wiki/types';

const page = (title: string, markdown: string, extra: Partial<WikiSourcePage> = {}): WikiSourcePage => ({ path: `${title}.md`, url: `https://cag.wiki/${encodeURIComponent(title).replace(/%20/g, '+')}`, title, aliases: [], tags: [], year: [], markdown, ...extra });
const vault = (pages: WikiSourcePage[], attachments: string[] = []): WikiVault => ({ fetchedAt: '', pages, attachments });

test('slugs follow the cag.wiki address, made URL-friendly', () => {
	expect(wikiSlug({ url: 'https://cag.wiki/art-under-risk' })).toBe('art-under-risk');
	expect(wikiSlug({ url: 'https://cag.wiki/Dog+Names+Overheard' })).toBe('dog-names-overheard');
});

test('cag.wiki links resolve by permalink, title, alias, or the last part of an old folder path', () => {
	const pages = [page('Working in public', '', { url: 'https://cag.wiki/working-in-public', aliases: ['WIP'] }), page('Dog Names Overheard', '')];
	const manifest = wikiManifest(pages);
	expect(resolveWikiUrl('https://cag.wiki/working-in-public', manifest)?.slug).toBe('working-in-public');
	expect(resolveWikiUrl('https://cag.wiki/public/til/Working+in+public', manifest)?.slug).toBe('working-in-public');
	expect(resolveWikiUrl('https://cag.wiki/WIP#notes', manifest)).toEqual({ slug: 'working-in-public', hash: '#notes' });
	expect(resolveWikiUrl('https://cag.wiki/Dog+Names+Overheard', manifest)?.slug).toBe('dog-names-overheard');
	expect(resolveWikiUrl('https://cag.wiki/Secret', manifest)).toBeNull();
	expect(resolveWikiUrl('https://example.com/working-in-public', manifest)).toBeNull();
});

test('rendered HTML keeps cag.wiki links on the site, in the same tab, and leaves unpublished pages alone', () => {
	const manifest = wikiManifest([page('Now', '')]);
	const html = '<a href="https://cag.wiki/Now" target="_blank" rel="noopener">now</a> <a href="https://cag.wiki/Secret">secret</a> <a href="https://cag.wiki">home</a>';
	expect(localizeWikiLinks(html, manifest)).toBe('<a href="/wiki/now" rel="noopener">now</a> <a href="https://cag.wiki/Secret">secret</a> <a href="/wiki/">home</a>');
});

test('wikilinks, aliases, headings, embeds and footnotes render as site HTML', () => {
	const wiki = buildWiki(sampleVault);
	const article = wiki.bySlug.get('art-under-risk')!;
	expect(article.html).toContain('<a href="/wiki/radical-actuarial-action">Radical Actuarial Action</a>');
	expect(article.html).toContain('<a href="/wiki/organizing#governance">Governance</a>');
	expect(article.html).toContain('<mark>Institutional risk</mark>');
	expect(article.html).toContain('<h2 id="concepts">Concepts</h2>');
	// The embedded section, and only that section.
	expect(article.html).toMatch(/<div class="wiki-embed"><a class="wiki-embed-title" href="\/wiki\/organizing#governance">Organizing<\/a><div class="wiki-embed-body">[\s\S]*Who decides/);
	expect(article.html).not.toContain('Running a meeting');
	expect(article.html).toMatch(/<sup class="footnote-ref"><a href="#fn-1" id="fnref-1">1<\/a><\/sup>/);
	expect(article.html).toContain('<li id="fn-1">Where I studied, and where the crisis began. <a href="#fnref-1"');
	expect(article.headings.map((heading) => heading.id)).toEqual(['concepts', 'reading']);
	expect(wiki.bySlug.get('radical-actuarial-action')!.html).toContain('src="https://publish-01.obsidian.md/access/8fa0f73a8388b8a25449a2b468e98cd2/Attachments/cairn.jpg"');
	expect(wiki.bySlug.get('home')!.html).toContain('<span class="wiki-link-missing" title="Not published">Federated Wiki</span>');
	// The first heading repeats the title, so it goes.
	expect(wiki.bySlug.get('home')!.html).not.toContain('<h1');
	expect(wiki.home?.slug).toBe('home');
});

test('backlinks and the graph count each link between pages once, in both directions', () => {
	const wiki = buildWiki(sampleVault);
	expect(wiki.bySlug.get('cooper-union')!.backlinks).toEqual(['art-under-risk', 'composite-financial-index']);
	expect(wiki.bySlug.get('art-under-risk')!.links).toEqual(['composite-financial-index', 'cooper-union', 'organizing', 'radical-actuarial-action']);
	const local = neighborhood(wiki.graph, 'radical-actuarial-action', 1);
	expect(local.nodes.map((node) => node.slug).sort()).toEqual(['art-under-risk', 'radical-actuarial-action']);
});

test('code is left as written, and links to renamed headings still open the page', () => {
	const wiki = buildWiki(vault([page('A', 'Use `[[B]]` to link. [[B#Gone]] and [[B]].'), page('B', '## Here')]));
	const html = wiki.bySlug.get('a')!.html;
	expect(html).toContain('<code>[[B]]</code>');
	expect(html).toContain('<a href="/wiki/b">B</a> and');
	expect(html).not.toContain('#gone');
});

test('Notion-style relative links and images find their page or file by name', () => {
	const wiki = buildWiki(vault([page('A', '[Mission](Mission%20e35f2c75ed5447c398625895d16ac45c.md) [Gone](Gone%20abc.md) ![](diagram.jpg)'), page('Mission', '')], ['Attachments/diagram.jpg']));
	const html = wiki.bySlug.get('a')!.html;
	expect(html).toContain('<a href="/wiki/mission">Mission</a>');
	expect(html).not.toContain('Gone%20abc');
	expect(html).toContain('Attachments/diagram.jpg');
});

test('previews keep the first blocks of a page, without ids that would clash with the page beneath', () => {
	const html = previewHtml('<h2 id="a">A</h2><p>' + 'word '.repeat(200) + '</p><p>Later</p>', 300);
	expect(html).not.toContain('id=');
	expect(html).not.toContain('Later');
});

test('graph layout is the same every time, so the server and the browser draw it alike', () => {
	const wiki = buildWiki(sampleVault);
	expect(layoutGraph(wiki.graph)).toEqual(layoutGraph(wiki.graph));
	const centered = layoutGraph(wiki.graph, { center: 'art-under-risk' });
	expect(centered.nodes.find((node) => node.slug === 'art-under-risk')).toMatchObject({ x: 0, y: 0 });
});

test('Dataview fields become details, %% comments stay hidden, and the repeated title goes', () => {
	const page = buildWiki(sampleVault).bySlug.get('nielsen-model-of-reops')!;
	expect(page.fields.map((field) => field.name)).toEqual(['Author', 'Source']);
	expect(page.fields[0].html).toContain('wiki-link-missing');
	expect(page.fields[1].html).toContain('href="/wiki/research-ops"');
	expect(page.html).not.toContain('%');
	expect(page.html).not.toContain('::');
	expect(page.html).not.toContain('<h1');
	expect(page.html).not.toContain('note to self');
	expect(page.excerpt.startsWith('ResearchOps 101')).toBe(true);
	expect(page.links).toContain('research-ops');
	// `%%` inside code is shown as written.
	const code = buildWiki({ ...sampleVault, pages: [{ ...sampleVault.pages[0], markdown: 'Use `%%` for comments.\n\nkey:: value' }] }).pages[0];
	expect(code.html).toContain('<code>%%</code>');
	expect(code.fields).toHaveLength(1);
});

test('links off the site open in a new tab and are marked', () => {
	const page = buildWiki(sampleVault).bySlug.get('nielsen-model-of-reops')!;
	expect(page.html).toMatch(/<a href="https:\/\/www\.nngroup\.com[^"]*" target="_blank" rel="noopener noreferrer" class="external">/);
	expect(buildWiki(sampleVault).bySlug.get('art-under-risk')!.html).not.toContain('external');
});

test('link addresses with spaces stay one link, as Obsidian allows, and titles still work', () => {
	const wiki = buildWiki(vault([page('Contact', 'Email: [me](mailto:me@example.org?subject=Making contact from cag.wiki)\n\nSee [site](https://example.org "Example") and `[a](b c)`.')]));
	const html = wiki.pages[0].html;
	expect(html).toContain('href="mailto:me@example.org?subject=Making%20contact%20from%20cag.wiki"');
	expect(html).not.toContain('Making contact from cag.wiki)');
	expect(html).toContain('title="Example"');
	expect(html).toContain('<code>[a](b c)</code>');
});

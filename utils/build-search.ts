import { Glob } from 'bun';
import { readFile, rm } from 'node:fs/promises';
import * as pagefind from 'pagefind';
import { parsePost, isPublicPost, PLURAL_TO_SINGULAR } from '../src/lib/server/parse-post';
import { getPostPermalink } from '../src/lib/posts-types';
import { searchDocument, postSearchContent, postSearchTitle, postSearchImage, escapeSearchHtml as escape } from './search-document';
import { bookTags, bookAuthors, postAuthors, uniqueLabels, yearFilter } from './search-filters';

function assertSuccess(result: { errors: string[] }) {
	if (result.errors.length) throw new Error(result.errors.join('\n'));
}
const { index, errors } = await pagefind.createIndex();
if (!index) throw new Error(errors.join('\n'));
let count = 0;
async function add(url: string, title: string, type: string, metadata: Record<string, unknown>, html: string, filters: Record<string, string[]> = {}) {
	assertSuccess(await index!.addHTMLFile({ url, content: searchDocument(title, type, metadata, html, filters) }));
	count++;
}
try {
	for await (const path of new Glob('*/*.md').scan('content')) {
		const [folder, file] = path.split('/');
		if (!Object.hasOwn(PLURAL_TO_SINGULAR, folder)) continue;
		const post = parsePost(await readFile(`content/${path}`, 'utf8'), folder, file);
		if (!isPublicPost(post)) continue;
		const tags = [post.category ?? []].flat().join(', ');
		const authors = postAuthors(post);
		const title = postSearchTitle(post);
		const displayAuthors = post.socialSnapshots?.length ? uniqueLabels(post.socialSnapshots.map(snapshot => snapshot.author.handle)) : ['Casey Gollan'];
		await add(getPostPermalink(post), title, post.type, { ...postSearchImage(post), date: post.date, tags, author: displayAuthors.join(', '), bookmark: post.bookmarkOf ?? '' }, `${post.title ? `<h1>${escape(post.title)}</h1>` : ''}${postSearchContent(post)}`, { Author: authors, Year: yearFilter(post.date) });
	}
	const graph = JSON.parse(await readFile('static/library/graph.json', 'utf8'));
	const catalog = JSON.parse(await readFile('utils/librarything_caseygollan.json', 'utf8'));
	for (const book of graph.nodes.filter((node: any) => node.g === 'book')) {
		const details = catalog[String(book.b)] ?? {};
		if (details.public === 'false') continue;
		const url = book.n ? `/library/${encodeURIComponent(book.n)}` : `/library/?book=${book.b}`;
		const tags = bookTags(details);
		const authors = bookAuthors(details);
		const cover = book.img || book.m;
		const metadata = { ...(cover ? { image: `/library/${cover}`, image_alt: `Cover of ${book.i}` } : {}), author: authors.join(', '), isbn: book.n ?? '', year: book.y ?? '', pages: book.p ?? '', acquired: book.d ?? '', tags: tags.join(', ') };
		await add(url, book.i, 'book', metadata, `<h1>${escape(book.i)}</h1><p>${escape([details.summary, details.publication, details.review, details.comments, Object.values(details.subject ?? {}).flat().join(', ')].filter(Boolean).join(' '))}</p><p>${escape([authors.join('; '), metadata.year, metadata.isbn, metadata.tags].filter(Boolean).join(' · '))}</p>`, { Tag: tags, Author: authors, Year: yearFilter(book.y) });
	}
	await rm('static/pagefind', { recursive: true, force: true });
	assertSuccess(await index.writeFiles({ outputPath: 'static/pagefind' }));
	console.log(`Pagefind indexed ${count} posts and books.`);
} finally {
	await pagefind.close();
}

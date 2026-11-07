import { Glob } from 'bun';
import { readFile, rm } from 'node:fs/promises';
import * as pagefind from 'pagefind';
import { marked } from 'marked';
import { parsePost, PLURAL_TO_SINGULAR } from '../src/lib/server/parse-post';
import { getPostPermalink } from '../src/lib/posts-types';

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
function assertSuccess(result: { errors: string[] }) {
	if (result.errors.length) throw new Error(result.errors.join('\n'));
}
const { index, errors } = await pagefind.createIndex();
if (!index) throw new Error(errors.join('\n'));
let count = 0;
async function add(url: string, title: string, type: string, metadata: Record<string, unknown>, html: string) {
	const meta = Object.entries(metadata).map(([key, value]) => `<span data-pagefind-meta="${key}">${escape(value)}</span>`).join(' ');
	assertSuccess(await index!.addHTMLFile({ url, content: `<html lang="en"><body><article data-pagefind-body><h1 data-pagefind-meta="title">${escape(title)}</h1> <p data-pagefind-filter="Type" data-pagefind-meta="type">${escape(type)}</p> ${meta} ${html}</article></body></html>` }));
	count++;
}
try {
	for await (const path of new Glob('*/*.md').scan('content')) {
		const [folder, file] = path.split('/');
		if (!Object.hasOwn(PLURAL_TO_SINGULAR, folder)) continue;
		const post = parsePost(await readFile(`content/${path}`, 'utf8'), folder, file);
		if (post.visibility && post.visibility !== 'public') continue;
		const tags = [post.category ?? []].flat().join(', ');
		const title = post.title || post.summary || `${post.type[0].toUpperCase() + post.type.slice(1)} · ${post.date.slice(0, 10)}`;
		await add(getPostPermalink(post), title, post.type, { date: post.date.slice(0, 10), tags, bookmark: post.bookmarkOf ?? '' }, await marked.parse(post.content + '\n\n' + (post.summary ?? '') + '\n\n' + [...(post.photo ?? []), ...(post.video ?? [])].map(m => m.alt ?? '').join(' ')));
	}
	const graph = JSON.parse(await readFile('static/library/graph.json', 'utf8'));
	const catalog = JSON.parse(await readFile('utils/librarything_caseygollan.json', 'utf8'));
	for (const book of graph.nodes.filter((node: any) => node.g === 'book')) {
		const details = catalog[String(book.b)] ?? {};
		if (details.public === 'false') continue;
		const url = book.n ? `/library/${encodeURIComponent(book.n)}` : `/library/?book=${book.b}`;
		const metadata = { author: details.primaryauthor ?? '', isbn: book.n ?? '', year: book.y ?? '', pages: book.p ?? '', acquired: book.d ?? '', tags: [...(details.genre ?? []), ...(details.ddc?.wording ?? [])].join(', ') };
		await add(url, book.i, 'book', metadata, `<p>${escape([details.summary, details.publication, details.review, details.comments, Object.values(details.subject ?? {}).flat().join(', ')].filter(Boolean).join(' '))}</p>`);
	}
	await rm('static/pagefind', { recursive: true, force: true });
	assertSuccess(await index.writeFiles({ outputPath: 'static/pagefind' }));
	console.log(`Pagefind indexed ${count} posts and books.`);
} finally {
	await pagefind.close();
}

/**
 * Convert posts stored as HTML in the content repository to Markdown, keeping any
 * post whose rendered output would change. Run with --write to update the files;
 * without it, report what would change.
 *
 *   bun utils/convert-html-content.ts [content-dir] [--write]
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDocument } from 'yaml';
import { htmlToMarkdown } from '../src/lib/utils/htmlToMarkdown';
import { sameRendering } from '../src/lib/utils/sameRendering';

const args = process.argv.slice(2);
const write = args.includes('--write');
const root = args.find(arg => !arg.startsWith('--')) ?? 'content';

function* files(dir: string): Generator<string> {
	for (const name of readdirSync(dir)) {
		if (name.startsWith('.')) continue;
		const path = join(dir, name);
		if (statSync(path).isDirectory()) yield* files(path);
		else if (name.endsWith('.md')) yield path;
	}
}

let converted = 0;
const kept: string[] = [];
for (const path of files(root)) {
	const source = readFileSync(path, 'utf8');
	const match = source.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	if (!match) continue;
	const yaml = parseDocument(match[1], { schema: 'core' });
	if (yaml.get('_micropubContentFormat') !== 'html') continue;
	const html = source.slice(match[0].length);
	const markdown = htmlToMarkdown(html);
	const problem = markdown === undefined ? 'uses HTML without a Markdown equivalent' : sameRendering(html, markdown);
	if (problem !== true) { kept.push(`${path}: ${problem}`); continue; }
	converted++;
	// Keep the format explicit so Micropub reads the body as content. Editing the line
	// itself leaves the rest of the frontmatter exactly as it was written.
	const frontmatter = match[0].replace(/^_micropubContentFormat: html(?=\r?\n)/m, '_micropubContentFormat: markdown');
	if (frontmatter === match[0]) { kept.push(`${path}: format key not on its own line`); converted--; continue; }
	if (write) writeFileSync(path, `${frontmatter}${markdown}\n`);
}
console.log(`${write ? 'Converted' : 'Would convert'} ${converted} posts to Markdown.`);
if (kept.length) console.log(`Kept ${kept.length} as HTML:\n${kept.join('\n')}`);

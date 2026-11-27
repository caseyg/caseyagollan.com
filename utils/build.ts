/**
 * Production build. The search index and the SvelteKit build don't depend on each other, so they
 * run at the same time and the index is moved into the Worker assets after. Storybook is built and
 * deployed by its own Worker (`deploy:storybook`, wrangler.storybook.jsonc), only when code changes.
 *
 * - Pagefind writes to a scratch folder, because `vite build` copies static/ while it runs.
 * - cag.wiki is fetched once, here, alongside the other steps. The search index and the wiki
 *   browser pages both read the file it lands in (`WIKI_VAULT`), waiting if they get there first.
 */
import { cp, rm, rename, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fetchWikiVault, writeWikiVault } from './wiki-vault';

const OUT = '.svelte-kit/cloudflare';
const PAGEFIND = '.svelte-kit/build-pagefind';
const WIKI = '.svelte-kit/build-wiki/vault.json';
/** The table view Claude shows (`src/mcp-app/`): its own small build, moved in beside the site's files. */
const MCP_APP = '.svelte-kit/build-mcp-app';
process.env.WIKI_VAULT = WIKI;

type Step = { name: string; cmd: string[]; env?: Record<string, string> };
const steps: Step[] = [
	{ name: 'search', cmd: ['bun', 'utils/build-search.ts'], env: { PAGEFIND_OUTPUT: PAGEFIND } },
	{ name: 'vite', cmd: ['node_modules/.bin/vite', 'build'] },
	{ name: 'mcp-app', cmd: ['node_modules/.bin/vite', 'build', '-c', 'vite.mcp-app.config.ts'], env: { MCP_APP_OUTPUT: MCP_APP } }
];

const started = performance.now();
const seconds = (from: number) => `${((performance.now() - from) / 1000).toFixed(1)}s`;
const children: ReturnType<typeof Bun.spawn>[] = [];

async function pipe(stream: ReadableStream<Uint8Array>, prefix: string, out: NodeJS.WriteStream) {
	const decoder = new TextDecoder();
	let buffered = '';
	for await (const chunk of stream) {
		buffered += decoder.decode(chunk, { stream: true });
		const lines = buffered.split('\n');
		buffered = lines.pop() ?? '';
		for (const line of lines) out.write(`${prefix} ${line}\n`);
	}
	if (buffered) out.write(`${prefix} ${buffered}\n`);
}

async function run(step: Step) {
	const from = performance.now();
	const prefix = `[${step.name}]`;
	const child = Bun.spawn(step.cmd, { env: { ...process.env, ...step.env }, stdout: 'pipe', stderr: 'pipe' });
	children.push(child);
	await Promise.all([pipe(child.stdout, prefix, process.stdout), pipe(child.stderr, prefix, process.stderr), child.exited]);
	if (child.exitCode !== 0) throw new Error(`${step.name} failed with exit code ${child.exitCode}`);
	console.log(`${prefix} done in ${seconds(from)}`);
}

try {
	await Promise.all([PAGEFIND, '.svelte-kit/build-wiki'].map((path) => rm(path, { recursive: true, force: true })));
	const from = performance.now();
	const wiki = fetchWikiVault().then(
		async (vault) => {
			await writeWikiVault(WIKI, vault);
			console.log(`[wiki] fetched ${vault.pages.length} pages in ${seconds(from)}`);
		},
		async (error: unknown) => {
			// Tell the steps waiting on the file, so they stop too.
			await mkdir('.svelte-kit/build-wiki', { recursive: true });
			await writeFile(`${WIKI}.failed`, error instanceof Error ? error.message : String(error));
			throw error;
		}
	);
	await Promise.all([wiki, ...steps.map(run)]);
	await rm(`${OUT}/pagefind`, { recursive: true, force: true });
	await cp(PAGEFIND, `${OUT}/pagefind`, { recursive: true });
	// The view's files go to /mcp-app/, with a note of which two the page that loads it should name.
	const built = JSON.parse(await readFile(`${MCP_APP}/.vite/manifest.json`, 'utf8')) as Record<string, { file: string; isEntry?: boolean; css?: string[] }>;
	const entry = Object.values(built).find((chunk) => chunk.isEntry);
	if (!entry) throw new Error('The table view built without an entry.');
	await rm(`${OUT}/mcp-app`, { recursive: true, force: true });
	await cp(MCP_APP, `${OUT}/mcp-app`, { recursive: true });
	await rm(`${OUT}/mcp-app/.vite`, { recursive: true, force: true });
	await writeFile(`${OUT}/mcp-app/manifest.json`, JSON.stringify({ js: entry.file, ...(entry.css?.[0] ? { css: entry.css[0] } : {}) }));
	// Keep the local copy current too, for `bun run dev` and the Search stories.
	await rm('static/pagefind', { recursive: true, force: true });
	await mkdir('static', { recursive: true });
	await rename(PAGEFIND, 'static/pagefind');
	console.log(`Build finished in ${seconds(started)}`);
} catch (error) {
	for (const child of children) child.kill();
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
}

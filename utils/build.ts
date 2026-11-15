/**
 * Production build. The search index, the SvelteKit build and Storybook don't depend on each
 * other, so they run at the same time and their output is moved into the Worker assets after.
 *
 * - Pagefind writes to a scratch folder, because `vite build` copies static/ while it runs.
 * - Storybook writes to a scratch folder, because the Cloudflare adapter empties
 *   .svelte-kit/cloudflare when it finishes.
 */
import { cp, rm, rename, mkdir } from 'node:fs/promises';

const OUT = '.svelte-kit/cloudflare';
const PAGEFIND = '.svelte-kit/build-pagefind';
const STORYBOOK = '.svelte-kit/build-storybook';

type Step = { name: string; cmd: string[]; env?: Record<string, string> };
const steps: Step[] = [
	{ name: 'search', cmd: ['bun', 'utils/build-search.ts'], env: { PAGEFIND_OUTPUT: PAGEFIND } },
	{ name: 'vite', cmd: ['node_modules/.bin/vite', 'build'] },
	{ name: 'storybook', cmd: ['node_modules/.bin/storybook', 'build', '--disable-telemetry', '--quiet', '-o', STORYBOOK], env: { STORYBOOK_SITE_ASSETS: 'external' } }
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
	await Promise.all([rm(PAGEFIND, { recursive: true, force: true }), rm(STORYBOOK, { recursive: true, force: true })]);
	await Promise.all(steps.map(run));
	await rm(`${OUT}/pagefind`, { recursive: true, force: true });
	await rm(`${OUT}/storybook`, { recursive: true, force: true });
	await cp(PAGEFIND, `${OUT}/pagefind`, { recursive: true });
	await rename(STORYBOOK, `${OUT}/storybook`);
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

import { plugin } from 'bun';
import { mock } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compile, compileModule } from 'svelte/compiler';

/**
 * Lets tests import modules that pull in Svelte components, such as the rich
 * editor's Lexical nodes. Components compile but never mount, so SvelteKit's
 * $app modules only need to exist.
 */
plugin({
	name: 'svelte',
	setup(build) {
		build.onLoad({ filter: /\.svelte$/ }, ({ path }) => ({
			contents: compile(readFileSync(path, 'utf8'), { filename: path, generate: 'client' }).js.code,
			loader: 'js'
		}));
		build.onLoad({ filter: /\.svelte\.js$/ }, ({ path }) => ({
			contents: compileModule(readFileSync(path, 'utf8'), { filename: path, generate: 'client' }).js.code,
			loader: 'js'
		}));
		// Rune modules written in TypeScript, such as the chat's `LiveThread`: types off first, then the runes.
		build.onLoad({ filter: /\.svelte\.ts$/ }, ({ path }) => ({
			contents: compileModule(new Bun.Transpiler({ loader: 'ts' }).transformSync(readFileSync(path, 'utf8')), { filename: path, generate: 'client' }).js.code,
			loader: 'js'
		}));
	}
});

// svelte-lexical only publishes a "svelte" export condition.
mock.module('svelte-lexical', () => import(resolve('node_modules/svelte-lexical/dist/index.js')));
mock.module('$app/environment', () => ({ browser: false, dev: false, building: false }));
mock.module('$app/navigation', () => ({ goto: async () => {}, invalidate: async () => {}, invalidateAll: async () => {}, afterNavigate: () => {}, beforeNavigate: () => {}, onNavigate: () => {}, replaceState: () => {}, pushState: () => {} }));
mock.module('$app/state', () => ({ page: { url: new URL('http://localhost/'), params: {}, data: {}, state: {} }, navigating: null, updated: { current: false } }));

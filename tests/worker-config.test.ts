import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { parseConfigFileTextToJson } from 'typescript';

test('deployment entrypoint preserves the existing Durable Object class', async () => {
	const root = new URL('../', import.meta.url);
	const { config, error } = parseConfigFileTextToJson(
		'wrangler.jsonc',
		await readFile(new URL('wrangler.jsonc', root), 'utf8')
	);
	expect(error).toBeUndefined();
	const entrypoint = new URL(config.main, root);
	const source = await readFile(entrypoint, 'utf8');
	const { exports } = new Bun.Transpiler({ loader: 'js' }).scan(source);
	expect(exports).toContain('default');
	expect(exports).toContain('IndieAuthStore');
	expect(config.durable_objects.bindings).toContainEqual({
		name: 'AUTH_STORE', class_name: 'IndieAuthStore'
	});
	expect(config.migrations).toContainEqual({
		tag: 'v1-indieauth', new_sqlite_classes: ['IndieAuthStore']
	});
});

import { isMap, parseDocument } from 'yaml';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Properties = Record<string, Json[]>;
export interface UpdateOperations {
	replace?: Properties;
	add?: Properties;
	delete?: Properties | string[];
}

const fields: Record<string, string> = {
	name: 'title', published: 'date', updated: 'updated',
	'bookmark-of': 'bookmarkOf', 'in-reply-to': 'inReplyTo'
};
const reverseFields = Object.fromEntries(Object.entries(fields).map(([property, field]) => [field, property]));
const formatKey = '_micropubContentFormat';
const blocked = new Set(['__proto__', 'constructor', 'prototype', formatKey]);

function validName(key: string): void {
	if (!key || blocked.has(key) || key.startsWith('mp-') || (key in reverseFields && reverseFields[key] !== key)) {
		throw new Error(`Unsupported property: ${key}`);
	}
}

function jsonValue(value: unknown): asserts value is Json {
	if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
	if (typeof value === 'number' && Number.isFinite(value)) return;
	if (Array.isArray(value)) { value.forEach(jsonValue); return; }
	if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
		for (const [key, child] of Object.entries(value)) {
			if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Unsafe property name');
			jsonValue(child);
		}
		return;
	}
	throw new Error('Properties must contain JSON values');
}

function validateProperties(properties: Properties): void {
	if (!properties || Array.isArray(properties) || typeof properties !== 'object') throw new Error('Expected property map');
	for (const [key, values] of Object.entries(properties)) {
		validName(key);
		if (!Array.isArray(values)) throw new Error(`Property ${key} must be an array`);
		jsonValue(values);
	}
}

function equal(a: Json, b: Json): boolean {
	if (a === b) return true;
	if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => equal(v, b[i]));
	if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
		const keys = Object.keys(a);
		return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && equal(a[key], b[key]));
	}
	return false;
}

function parse(markdown: string) {
	const match = markdown.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	if (/^\uFEFF?---(?:\r?\n|$)/.test(markdown) && !match) throw new Error('Unclosed frontmatter');
	const yaml = parseDocument(match?.[1] ?? '', { schema: 'core', uniqueKeys: true });
	if (yaml.errors.length) throw new Error('Invalid YAML frontmatter');
	if (yaml.contents !== null && !isMap(yaml.contents)) throw new Error('Frontmatter must be a mapping');
	const data = yaml.toJS({ maxAliasCount: 0 }) ?? {};
	jsonValue(data);
	return { yaml, data: data as Record<string, Json>, body: match ? markdown.slice(match[0].length) : markdown };
}

/** Legacy Markdown keeps its source format; a protocol handler must render it for q=source. */
export function readDocument(markdown: string): { properties: Properties; body: string; bodyFormat: 'text' | 'html' | 'markdown' } {
	const { data, body } = parse(markdown);
	const properties: Properties = Object.create(null);
	for (const [key, value] of Object.entries(data)) {
		// Historical rendering metadata stays in YAML, outside the protocol property map.
		if (key === formatKey || key.startsWith('mp-')) continue;
		const property = Object.hasOwn(reverseFields, key) ? reverseFields[key] : key;
		validName(property);
		if (Object.hasOwn(properties, property)) throw new Error(`Ambiguous frontmatter property: ${property}`);
		properties[property] = Array.isArray(value) ? value : [value];
	}
	const format = data[formatKey];
	if (format !== undefined && format !== 'text' && format !== 'html') throw new Error('Unknown content format');
	if (format === 'text') properties.content = [body];
	if (format === 'html') properties.content = [{ html: body }];
	return { properties, body, bodyFormat: format ?? 'markdown' };
}

/** Apply updates to the full document, preserving unrelated frontmatter and body source. */
export function updateDocument(markdown: string, operations: UpdateOperations): string {
	const original = readDocument(markdown);
	const legacyContent = original.bodyFormat === 'markdown' && original.body.length > 0;
	if (legacyContent && operations.add && Object.hasOwn(operations.add, 'content')) {
		throw new Error('Cannot add content to an existing Markdown body; use replace');
	}
	if (legacyContent && operations.delete && !Array.isArray(operations.delete) && Object.hasOwn(operations.delete, 'content')) {
		throw new Error('Deleting individual content values requires an explicit source format');
	}
	const deleteLegacyContent = legacyContent && Array.isArray(operations.delete) && operations.delete.includes('content');
	const properties = structuredClone(original.properties);
	for (const kind of ['replace', 'add'] as const) {
		const changes = operations[kind];
		if (!changes) continue;
		validateProperties(changes);
		for (const [key, values] of Object.entries(changes)) {
			properties[key] = kind === 'replace' ? structuredClone(values) : [...(properties[key] ?? []), ...structuredClone(values)];
		}
	}
	if (Array.isArray(operations.delete)) {
		for (const key of operations.delete) { validName(key); delete properties[key]; }
	} else if (operations.delete) {
		validateProperties(operations.delete);
		for (const [key, values] of Object.entries(operations.delete)) {
			if (properties[key]) properties[key] = properties[key].filter(value => !values.some(remove => equal(value, remove)));
		}
	}
	for (const key of Object.keys(properties)) if (properties[key].length === 0) delete properties[key];
	if (original.properties.published && !equal(original.properties.published, properties.published ?? [])) {
		throw new Error('Changing published would change the existing post identity');
	}
	if (!deleteLegacyContent && equal(original.properties, properties)) return markdown;
	const { yaml } = parse(markdown);
	let body = original.body;
	for (const key of new Set([...Object.keys(original.properties), ...Object.keys(properties), ...(deleteLegacyContent ? ['content'] : [])])) {
		if (!(key === 'content' && deleteLegacyContent) && equal(original.properties[key] ?? [], properties[key] ?? [])) continue;
		const values = properties[key];
		if (key === 'content') {
			if (!values) { body = ''; yaml.delete(formatKey); continue; }
			if (values.length !== 1) throw new Error('Content must have exactly one value');
			const value = values[0];
			if (typeof value === 'string') { body = value; yaml.set(formatKey, 'text'); }
			else if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 1 && typeof value.html === 'string') {
				body = value.html; yaml.set(formatKey, 'html');
			} else throw new Error('Content must be text or an HTML object');
			continue;
		}
		const field = Object.hasOwn(fields, key) ? fields[key] : key;
		if (!values) yaml.delete(field);
		else if (Object.hasOwn(fields, key)) {
			if (values.length !== 1 || typeof values[0] !== 'string') throw new Error(`${key} must have one string value`);
			yaml.set(field, values[0]);
		} else yaml.set(field, values);
	}
	return `---\n${yaml.toString()}---\n${body}`;
}

export function createDocument(properties: Properties): string {
	validateProperties(properties);
	return updateDocument('', { replace: properties });
}

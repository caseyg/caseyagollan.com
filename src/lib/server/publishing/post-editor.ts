import { ProtocolError, type Fetcher } from './auth';
import type { Json, Properties } from './document';
import { createMicropubHandler, type PublishingConfig } from './micropub';

export type ContentFormat = 'text' | 'markdown' | 'html';
/** Reference URLs that define a post's type, labelled as in Quill. */
export const URL_FIELDS = [['in-reply-to', 'Reply To'], ['bookmark-of', 'Bookmark URL'], ['like-of', 'Like of'], ['repost-of', 'Repost of']] as const;
export interface EditorFields {
	urls: Record<string, string>;
	name?: string; summary?: string;
	content: string; format: ContentFormat;
	category: string; status: 'published' | 'draft';
}
export interface EditorSource { revision: string; published: string; photos: number; fields: EditorFields }
interface Dependencies { fetcher?: Fetcher; now?: () => Date }

const single = (values: Json[] | undefined) => values?.length === 1 && typeof values[0] === 'string' ? values[0] : undefined;
const lines = (value: string) => value.replace(/\r\n?/g, '\n');
const tags = (value: string) => [...new Set(value.split(',').map(tag => tag.trim().replace(/^#/, '')).filter(Boolean))];

/**
 * Send one Micropub request as the signed-in owner. The session stands in for a
 * client token: a credential minted for this call is accepted by this handler only.
 */
export function ownerMicropub(config: PublishingConfig, dependencies: Dependencies, scope = 'update draft create') {
	const token = crypto.randomUUID().replaceAll('-', '');
	const handler = createMicropubHandler({ ...config, introspect: async value => value === token ? { active: true, me: config.me, scope } : { active: false } }, dependencies);
	return async (query: string, init: RequestInit = {}) => {
		const response = await handler(new Request(new URL(`/micropub${query}`, config.me), { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } }));
		if (response.ok) return response;
		const body = await response.json().catch(() => ({})) as { error?: string; error_description?: string };
		throw new ProtocolError(response.status, body.error ?? 'invalid_request', response.status === 412 ? 'The post changed since you opened it. Reload to edit the latest version.' : body.error_description ?? 'The post could not be saved.');
	};
}

export function editorFields(properties: Properties): EditorFields {
	const value = properties.content?.[0];
	const html = value && typeof value === 'object' && !Array.isArray(value) && typeof value.html === 'string' ? value.html : undefined;
	return {
		urls: Object.fromEntries(URL_FIELDS.flatMap(([key]) => single(properties[key]) === undefined ? [] : [[key, single(properties[key])!]])),
		name: single(properties.name), summary: single(properties.summary),
		content: html ?? (typeof value === 'string' ? value : ''),
		format: html !== undefined ? 'html' : typeof value === 'string' && properties['p3k-content-type']?.[0] !== 'text/markdown' ? 'text' : 'markdown',
		category: (properties.category ?? []).filter(tag => typeof tag === 'string').join(', '),
		status: properties['post-status']?.[0] === 'draft' || properties.draft?.[0] === true ? 'draft' : 'published'
	};
}

/** The smallest Micropub update that turns the stored source into the submitted form. */
export function editorOperations(properties: Properties, submitted: EditorFields): { replace?: Properties; delete?: string[] } {
	const current = editorFields(properties);
	const replace: Properties = {};
	const remove: string[] = [];
	const text = (key: string, before: string | undefined, after: string | undefined) => {
		if (after === undefined || after.trim() === (before ?? '')) return;
		if (after.trim()) replace[key] = [after.trim()]; else remove.push(key);
	};
	for (const [key, label] of URL_FIELDS) {
		if (!(key in current.urls)) continue;
		if (submitted.urls[key] !== undefined && !submitted.urls[key].trim()) throw new ProtocolError(422, 'invalid_request', `${label} needs a URL.`);
		text(key, current.urls[key], submitted.urls[key]);
	}
	text('name', current.name, submitted.name);
	text('summary', current.summary, submitted.summary);
	const content = lines(submitted.content);
	if (content.trim() !== lines(current.content).trim() || (content.trim() && submitted.format !== current.format)) {
		if (!content.trim()) remove.push('content');
		else replace.content = [submitted.format === 'html' ? { html: content } : content];
		if (content.trim() && submitted.format === 'markdown') replace['p3k-content-type'] = ['text/markdown'];
		else if (properties['p3k-content-type']) remove.push('p3k-content-type');
	}
	const category = tags(submitted.category);
	if (JSON.stringify(category) !== JSON.stringify(tags(current.category))) {
		if (category.length) replace.category = category; else remove.push('category');
	}
	if (submitted.status !== current.status) replace['post-status'] = [submitted.status];
	return { ...(Object.keys(replace).length ? { replace } : {}), ...(remove.length ? { delete: remove } : {}) };
}

async function source(micropub: ReturnType<typeof ownerMicropub>, url: string) {
	// Ask for Markdown source so older posts are edited as written, not as rendered HTML.
	const response = await micropub(`?q=source&p3k-content-type=text%2Fmarkdown&url=${encodeURIComponent(url)}`);
	const { properties } = await response.json() as { properties: Properties };
	if (properties.deleted?.[0] === true) throw new ProtocolError(410, 'invalid_request', 'This post was deleted. Restore it before editing.');
	return { properties, revision: response.headers.get('ETag') ?? '' };
}

export async function loadEditorSource(config: PublishingConfig, url: string, dependencies: Dependencies = {}): Promise<EditorSource> {
	const { properties, revision } = await source(ownerMicropub(config, dependencies), url);
	return { revision, published: single(properties.published) ?? '', photos: properties.photo?.length ?? 0, fields: editorFields(properties) };
}

/** Returns false when the form matches the stored post. Stale forms are rejected. */
export async function saveEditorPost(config: PublishingConfig, url: string, revision: string, submitted: EditorFields, dependencies: Dependencies = {}): Promise<boolean> {
	const micropub = ownerMicropub(config, dependencies);
	const current = await source(micropub, url);
	if (!revision || revision !== current.revision) throw new ProtocolError(412, 'invalid_request', 'The post changed since you opened it. Reload to edit the latest version.');
	const operations = editorOperations(current.properties, submitted);
	if (!Object.keys(operations).length) return false;
	await micropub('', { method: 'POST', headers: { 'Content-Type': 'application/json', 'If-Match': revision }, body: JSON.stringify({ action: 'update', url, ...operations }) });
	return true;
}

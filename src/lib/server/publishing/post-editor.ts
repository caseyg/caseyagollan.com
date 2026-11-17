import { ProtocolError, type Fetcher } from './auth';
import type { Json, Properties } from './document';
import { createMicropubHandler, type PublishingConfig } from './micropub';
import { htmlToMarkdown } from '../../utils/htmlToMarkdown';
import { sameRendering } from '../../utils/sameRendering';

export type ContentFormat = 'text' | 'markdown' | 'html';
/** Reference URLs that define a post's type, labelled as in Quill. */
export const URL_FIELDS = [['in-reply-to', 'Reply To'], ['bookmark-of', 'Bookmark URL'], ['like-of', 'Like of'], ['repost-of', 'Repost of']] as const;
/** Properties with their own controls in the editor, never shown as frontmatter rows. */
const OWN_CONTROLS = new Set(['content', 'photo', 'p3k-content-type', 'name', 'post-status', 'published', 'updated']);
/** Properties the Micropub endpoint keeps to itself. They are shown but cannot be edited. */
const LOCKED = new Set(['draft', 'deleted', 'syndicationTargets', 'url', 'visibility', 'mp-channel']);
const PROPERTY_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export interface EditorFields {
	name?: string;
	content: string; format: ContentFormat;
	status: 'published' | 'draft';
	/** Frontmatter properties whose values are plain text. Undefined leaves them all untouched. */
	properties?: Record<string, string[]>;
	/** Alt text for each attached photo, in order. Undefined leaves the photos untouched. */
	photoAlts?: string[];
}
/** A photo attached in frontmatter, as the editor shows it. */
export interface EditorPhoto { url: string; alt: string }
/** A frontmatter property shown but not editable here, such as photos or bookkeeping. */
export interface ReadOnlyProperty { key: string; values: Json[] }
export interface EditorSource {
	revision: string; published: string; updated?: string;
	/** Photos attached in frontmatter, edited for their alt text only. */
	photos: EditorPhoto[];
	/** The post's file in the content repository. */
	path?: string;
	fields: EditorFields; readOnly: ReadOnlyProperty[];
	/** Set when an HTML post opens as Markdown; saving stores the Markdown. */
	convertedFromHtml?: boolean;
}
interface Dependencies { fetcher?: Fetcher; now?: () => Date }

const single = (values: Json[] | undefined) => values?.length === 1 && typeof values[0] === 'string' ? values[0] : undefined;
const lines = (value: string) => value.replace(/\r\n?/g, '\n');
const tags = (values: string[]) => [...new Set(values.flatMap(value => value.split(',')).map(tag => tag.trim().replace(/^#/, '')).filter(Boolean))];
const textValues = (values: Json[] | undefined): values is string[] => !!values?.length && values.every(value => typeof value === 'string');
const editable = (key: string, values: Json[] | undefined) => !OWN_CONTROLS.has(key) && !LOCKED.has(key) && !key.startsWith('mp-') && textValues(values);
const clean = (key: string, values: string[]) => key === 'category' ? tags(values) : values.map(value => lines(value).trim()).filter(Boolean);
const record = (value: Json): value is { [key: string]: Json } => !!value && typeof value === 'object' && !Array.isArray(value);
/** Alt text is one line of plain text. */
const altText = (value: string) => value.replace(/\s+/g, ' ').trim();

/** Frontmatter photos are URLs, or objects with a url (or Micropub value) and alt text. */
export function editorPhotos(properties: Properties): EditorPhoto[] {
	return (properties.photo ?? []).map(photo => {
		if (typeof photo === 'string') return { url: photo, alt: '' };
		const url = record(photo) ? photo.url ?? photo.value : undefined;
		const alt = record(photo) ? photo.alt : undefined;
		return { url: typeof url === 'string' ? url : '', alt: typeof alt === 'string' ? alt : '' };
	});
}

/** The stored photos with new alt text, keeping each photo's own shape and fields. */
function photosWithAlts(photos: Json[], alts: string[]): Json[] {
	return photos.map((photo, index): Json => {
		const alt = altText(alts[index] ?? '');
		if (typeof photo === 'string') return alt ? { url: photo, alt } : photo;
		return record(photo) ? { ...photo, alt } : photo;
	});
}

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
		name: single(properties.name),
		content: html ?? (typeof value === 'string' ? value : ''),
		format: html !== undefined ? 'html' : typeof value === 'string' && properties['p3k-content-type']?.[0] !== 'text/markdown' ? 'text' : 'markdown',
		status: properties['post-status']?.[0] === 'draft' || properties.draft?.[0] === true ? 'draft' : 'published',
		properties: Object.fromEntries(Object.entries(properties).filter(([key, values]) => editable(key, values)).map(([key, values]) => [key, values as string[]]))
	};
}

/** Properties shown as read-only rows: structured values (photos, locations) and protocol bookkeeping. */
export function readOnlyProperties(properties: Properties): ReadOnlyProperty[] {
	return Object.entries(properties).filter(([key, values]) => !OWN_CONTROLS.has(key) && !editable(key, values) && values.length).map(([key, values]) => ({ key, values }));
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
	text('name', current.name, submitted.name);
	if (submitted.properties) {
		for (const [key, values] of Object.entries(submitted.properties)) {
			if (!PROPERTY_NAME.test(key) || OWN_CONTROLS.has(key) || LOCKED.has(key) || (properties[key] && !editable(key, properties[key]))) throw new ProtocolError(422, 'invalid_request', `The ${key} property cannot be edited here.`);
			if (!Array.isArray(values) || values.some(value => typeof value !== 'string')) throw new ProtocolError(422, 'invalid_request', `The ${key} property needs text values.`);
		}
		const keys = new Set([...Object.keys(current.properties ?? {}), ...Object.keys(submitted.properties)]);
		for (const key of keys) {
			const before = current.properties?.[key] ?? [];
			const after = clean(key, submitted.properties[key] ?? []);
			const label = URL_FIELDS.find(([name]) => name === key)?.[1];
			if (label && before.length && !after.length) throw new ProtocolError(422, 'invalid_request', `${label} needs a URL.`);
			if (JSON.stringify(after) === JSON.stringify(clean(key, before))) continue;
			if (after.length) replace[key] = after; else if (before.length) remove.push(key);
		}
	}
	const content = lines(submitted.content);
	if (content.trim() !== lines(current.content).trim() || (content.trim() && submitted.format !== current.format)) {
		if (!content.trim()) remove.push('content');
		else replace.content = [submitted.format === 'html' ? { html: content } : content];
		if (content.trim() && submitted.format === 'markdown') replace['p3k-content-type'] = ['text/markdown'];
		else if (properties['p3k-content-type']) remove.push('p3k-content-type');
	}
	if (submitted.photoAlts) {
		const photos = properties.photo ?? [];
		if (submitted.photoAlts.length !== photos.length || submitted.photoAlts.some(alt => typeof alt !== 'string')) throw new ProtocolError(422, 'invalid_request', 'The photos changed since you opened the post. Reload to edit the latest version.');
		const before = editorPhotos(properties).map(photo => photo.alt);
		if (submitted.photoAlts.some((alt, index) => altText(alt) !== before[index])) replace.photo = photosWithAlts(photos, submitted.photoAlts);
	}
	if (submitted.status !== current.status) replace['post-status'] = [submitted.status];
	return { ...(Object.keys(replace).length ? { replace } : {}), ...(remove.length ? { delete: remove } : {}) };
}

async function source(micropub: ReturnType<typeof ownerMicropub>, url: string) {
	// Ask for Markdown source so older posts are edited as written, not as rendered HTML.
	const response = await micropub(`?q=source&p3k-content-type=text%2Fmarkdown&url=${encodeURIComponent(url)}`);
	const { properties } = await response.json() as { properties: Properties };
	if (properties.deleted?.[0] === true) throw new ProtocolError(410, 'invalid_request', 'This post was deleted. Restore it before editing.');
	return { properties, revision: response.headers.get('ETag') ?? '', path: response.headers.get('X-Content-Path') ?? undefined };
}

export async function loadEditorSource(config: PublishingConfig, url: string, dependencies: Dependencies = {}): Promise<EditorSource> {
	const { properties, revision, path } = await source(ownerMicropub(config, dependencies), url);
	const fields = editorFields(properties);
	// HTML opens as Markdown when Markdown renders the same post; saving then stores Markdown.
	const markdown = fields.format === 'html' ? htmlToMarkdown(fields.content) : undefined;
	const converted = markdown !== undefined && sameRendering(fields.content, markdown) === true;
	return {
		revision, published: single(properties.published) ?? '', updated: single(properties.updated), photos: editorPhotos(properties), path,
		fields: converted ? { ...fields, content: markdown, format: 'markdown' } : fields,
		readOnly: readOnlyProperties(properties), ...(converted ? { convertedFromHtml: true } : {})
	};
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

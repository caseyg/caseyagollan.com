import { marked } from 'marked';
import { sanitizePublishingHtml } from '../../utils/sanitizeHtml';
import { queuePublication, requestedSyndication, syndicationTargets } from './delivery';
import type { SyndicationConfig } from './syndication';
import { authorize, profileUrl, ProtocolError, type AuthConfig, type Fetcher } from './auth';
import { createDocument, readDocument, updateDocument, type Properties, type UpdateOperations } from './document';
import { createGitHubStore, GitHubStoreError } from './github';
import { validPostParams } from '../github-posts';
import { POST_TYPE_PLURALS } from '../../posts-types';

export interface PublishingConfig extends AuthConfig {
	owner: string; repo: string; branch: string; token: string; timeZone: string; mediaEnabled?: boolean; mediaBaseUrl?: string; state?: R2Bucket; deliveryEnabled?: boolean; syndication?: SyndicationConfig;
}
interface Dependencies { fetcher?: Fetcher; now?: () => Date; id?: () => string }
const folders = Object.values(POST_TYPE_PLURALS);
const bad = (message: string) => new ProtocolError(400, 'invalid_request', message);

function record(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw bad('Expected an object');
	return value as Record<string, unknown>;
}

async function body(request: Request): Promise<{ input: Record<string, unknown>; bodyToken: string | undefined }> {
	const reader = request.body?.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	if (reader) while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > 128 * 1024) { await reader.cancel(); throw new ProtocolError(413, 'invalid_request', 'Request exceeds 128 KiB'); }
		chunks.push(value);
	}
	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
	const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	const mime = request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
	if (mime === 'application/json') return { input: record(JSON.parse(text)), bodyToken: undefined };
	if (mime && mime !== 'application/x-www-form-urlencoded') throw new ProtocolError(415, 'invalid_request', 'Use JSON or form encoding; uploads are not enabled');
	const form = new URLSearchParams(text);
	for (const name of ['access_token', 'action', 'url', 'h']) if (form.getAll(name).length > 1) throw bad(`Send ${name} once`);
	const properties: Properties = Object.create(null);
	for (const [name, value] of form) {
		if (['h', 'access_token', 'action', 'url'].includes(name)) continue;
		const key = name.replace(/\[\]$/, '');
		if (key.includes('[') || key.includes(']')) throw bad('Structured form properties require JSON');
		(properties[key] ??= []).push(value);
	}
	return { input: form.has('action') ? { action: form.get('action'), url: form.get('url'), properties } : { type: [`h-${form.get('h') ?? 'entry'}`], properties }, bodyToken: form.get('access_token') ?? undefined };
}

function timestamp(now: Date, timeZone: string): string {
	const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset' }).formatToParts(now);
	const get = (type: string) => parts.find(p => p.type === type)!.value;
	const zone = get('timeZoneName').replace('GMT', '') || '+00:00';
	return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}${zone}`;
}

function dated(value: unknown): string {
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value)) ||
		!validPostParams({ year: value.slice(0, 4), month: value.slice(5, 7), day: value.slice(8, 10), slug: 'date' })) throw bad('Use a valid published timestamp with a timezone');
	return value;
}

function location(value: unknown, me: string) {
	if (typeof value !== 'string') throw bad('A post URL is required');
	const url = new URL(value);
	if (url.origin !== new URL(me).origin || url.username || url.password || url.search || url.hash) throw bad('Use an owned post URL');
	const match = url.pathname.match(/^\/(\d{4})\/(\d{2})\/(\d{2})\/([^/]+)\/?$/);
	if (!match) throw bad('Use a dated post URL');
	const slug = decodeURIComponent(match[4]);
	const params = { year: match[1], month: match[2], day: match[3], slug };
	if (/[%?#]/.test(slug) || !validPostParams(params)) throw bad('Invalid post URL');
	return { ...params, date: `${match[1]}-${match[2]}-${match[3]}`, url: `${new URL(me).origin}/${match[1]}/${match[2]}/${match[3]}/${encodeURIComponent(slug)}/` };
}

function publicProperties(properties: Properties, removing = false) {
	for (const [key, values] of Object.entries(properties)) {
		if (!Array.isArray(values)) throw bad('Property values must be arrays');
		if (key.startsWith('_') || key === 'draft' || key === 'syndicationTargets' || key === 'deleted' || key === 'url' || key.startsWith('mp-')) throw bad(`Unsupported property: ${key}`);
		if (removing && values.length === 0) continue;
		if (key === 'visibility' && (values.length !== 1 || values[0] !== 'public')) throw bad('Private visibility is not enabled');
		if (key === 'post-status' && (values.length !== 1 || !['published', 'draft'].includes(String(values[0])))) throw bad('Use published or draft post-status');
		if (key === 'content') {
			if (values.length !== 1) throw bad('Use one content value');
			const value = values[0];
			if (typeof value !== 'string') {
				if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1 || typeof value.html !== 'string') throw bad('Use text or one HTML content object');
				values[0] = { html: sanitizePublishingHtml(value.html) };
			}
		}
		if (key === 'published' && (values.length !== 1 || typeof values[0] !== 'string')) throw bad('Use one published timestamp');
		if (['category', 'summary'].includes(key) && values.some(value => typeof value !== 'string')) throw bad(`Use text values for ${key}`);
		if (['bookmark-of', 'in-reply-to', 'photo', 'video', 'syndication'].includes(key)) {
			for (const value of values) {
				const href = typeof value === 'string' ? value : value && typeof value === 'object' && !Array.isArray(value) ? value.value ?? value.url : undefined;
				if (typeof href !== 'string' || !['http:', 'https:'].includes(new URL(href).protocol)) throw bad(`Invalid ${key} URL`);
			}
		}
	}
}

/** A configurable resource server; authorization-code issuance remains with the trusted provider. */
export function createMicropubHandler(config?: PublishingConfig, dependencies: Dependencies = {}) {
	return async (request: Request): Promise<Response> => {
		const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, If-Match', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Expose-Headers': 'Location, ETag, Warning', 'Cache-Control': 'no-store' };
		const json = (value: unknown, status = 200, extra: HeadersInit = {}) => Response.json(value, { status, headers: { ...headers, ...Object.fromEntries(new Headers(extra)) } });
		try {
			if (!config) throw new ProtocolError(503, 'temporarily_unavailable', 'Publishing is not configured');
			const me = profileUrl(config.me);
			if (new URL(me).pathname !== '/' || new URL(me).search) throw new ProtocolError(503, 'temporarily_unavailable', 'Publishing requires a root profile URL');
			if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
			if (!['GET', 'POST'].includes(request.method)) return json({ error: 'invalid_request' }, 405, { Allow: 'GET, POST, OPTIONS' });
			const url = new URL(request.url);
			const parsed = request.method === 'POST' ? await body(request) : { input: {} as Record<string, unknown>, bodyToken: undefined };
			const input = parsed.input;
			const action = request.method === 'GET' ? (url.searchParams.get('q') === 'source' ? 'update' : '') : (input.action ?? 'create');
			if (typeof action !== 'string' || !['', 'create', 'update', 'delete', 'undelete'].includes(action)) throw bad('Unsupported action');
			const deadline = AbortSignal.timeout(15000);
			const upstream: Fetcher = (target, init) => (dependencies.fetcher ?? fetch)(target, { ...init, signal: AbortSignal.any([deadline, request.signal, ...(init.signal ? [init.signal] : [])]) });
			const createDraft = action === 'create' && input.properties && typeof input.properties === 'object' && !Array.isArray(input.properties) && (input.properties as Record<string, unknown>)['post-status'] instanceof Array && ((input.properties as Record<string, unknown>)['post-status'] as unknown[])[0] === 'draft';
			await authorize(request, action === 'undelete' ? 'delete' : createDraft ? 'draft' : action, config, upstream, parsed.bodyToken);
			const store = createGitHubStore(config, upstream);
			const now = dependencies.now?.() ?? new Date();
			// Captured before content reads: a competing create in any folder invalidates this write.
			const expectedHead = request.method === 'POST' ? await store.head() : undefined;

			async function find(value: unknown) {
				const target = location(value, me);
				const ms = Date.parse(`${target.date}T00:00:00Z`);
				const dates = [target.date, new Date(ms + 86400000).toISOString().slice(0, 10), new Date(ms - 86400000).toISOString().slice(0, 10)];
				let found: { path: string; content: string; sha: string } | undefined;
				for (const folder of folders) for (const date of dates) {
					const file = await store.read(`${folder}/${date}-${target.slug}.md`);
					if (file && readDocument(file.content).properties.published?.[0]?.toString().startsWith(target.date)) {
						if (found) throw new ProtocolError(409, 'invalid_request', 'Multiple content files share this URL');
						found = file;
					}
				}
				return { target, file: found };
			}

			if (request.method === 'GET') {
				const q = url.searchParams.get('q');
				if (q === 'config') return json({ ...(config.mediaEnabled ? { 'media-endpoint': new URL('/micropub/media', request.url).href } : {}), 'syndicate-to': syndicationTargets(config), 'post-statuses': ['published', 'draft'], 'post-types': ['note', 'article', 'bookmark', 'reply', ...(config.mediaEnabled ? ['photo', 'video'] : [])].map(type => ({ type, name: type })) });
				if (q === 'syndicate-to') return json({ 'syndicate-to': syndicationTargets(config) });
				if (q !== 'source') throw bad('Unsupported query');
				const { file } = await find(url.searchParams.get('url'));
				if (!file) throw new ProtocolError(404, 'invalid_request', 'Post not found');
				const doc = readDocument(file.content);
				const properties: Properties = { ...doc.properties };
				delete properties.syndicationTargets;
				if (!properties.content && doc.body) properties.content = [{ html: sanitizePublishingHtml(marked.parse(doc.body, { async: false })) }];
				const filter = url.searchParams.getAll('properties[]');
				return json({ properties: filter.length ? Object.fromEntries(Object.entries(properties).filter(([key]) => filter.includes(key))) : properties }, 200, { ETag: `"${file.sha}"` });
			}

			if (action === 'create') {
				if (input.type !== undefined && (!Array.isArray(input.type) || input.type.length !== 1 || input.type[0] !== 'h-entry')) throw bad('Only h-entry is supported');
				const properties = structuredClone(record(input.properties)) as Properties;
				const requestedSlug = properties['mp-slug'];
				delete properties['mp-slug'];
				const photoAlts = properties['mp-photo-alt'];
				delete properties['mp-photo-alt'];
				if (photoAlts !== undefined) {
					if (!Array.isArray(photoAlts) || !Array.isArray(properties.photo) || photoAlts.length !== properties.photo.length || photoAlts.some(alt => typeof alt !== 'string') || properties.photo.some(photo => typeof photo !== 'string')) throw bad('Use one text alt value per photo');
					properties.photo = properties.photo.map((photo, index) => ({ value: photo, alt: photoAlts[index] }));
				}
				if (input['mp-syndicate-to'] !== undefined && properties['mp-syndicate-to'] !== undefined) throw bad('Send syndication targets once');
				let requested: ('mastodon' | 'bluesky')[];
				try { requested = requestedSyndication(input['mp-syndicate-to'] ?? properties['mp-syndicate-to'], config); } catch { throw bad('Syndication target is not configured'); }
				delete properties['mp-syndicate-to'];
				publicProperties(properties);
				if (requested.length) properties.syndicationTargets = requested;
				const published = dated(properties.published?.[0] ?? timestamp(now, config.timeZone));
				properties.published = [published];
				const id = dependencies.id?.() ?? crypto.randomUUID().slice(0, 8);
				const title = typeof properties.name?.[0] === 'string' ? properties.name[0].normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 80) : '';
				if (requestedSlug !== undefined && (!Array.isArray(requestedSlug) || requestedSlug.length !== 1 || typeof requestedSlug[0] !== 'string')) throw bad('Use one slug');
				const slug = requestedSlug?.[0] ?? `${title ? `${title}-` : ''}${id}`;
				if (typeof slug !== 'string' || slug.length > 120) throw bad('Invalid slug');
				const target = location(`${new URL(me).origin}/${published.slice(0, 10).replaceAll('-', '/')}/${encodeURIComponent(slug)}/`, me);
				if ((await find(target.url)).file) throw new ProtocolError(409, 'invalid_request', 'Post URL already exists');
				const folder = properties['in-reply-to'] ? 'replies' : properties['bookmark-of'] ? 'bookmarks' : properties.video ? 'videos' : properties.photo ? 'photos' : properties.name ? 'articles' : 'notes';
				if (properties['like-of'] || properties['repost-of']) throw bad('This post type is not enabled yet');
				if (!properties.content?.length && !properties.name?.length && !properties['bookmark-of']?.length && !properties['in-reply-to']?.length && !properties.photo?.length && !properties.video?.length) throw bad('Post is empty');
				const path = `${folder}/${target.date}-${slug}.md`;
				const markdown = createDocument(properties);
				const saved = await store.write(path, markdown, { expectedHead, message: `Publish ${target.slug}` });
				const queued = await queuePublication(config, path, markdown, undefined, saved.commit);
				return new Response(null, { status: 202, headers: { ...headers, Location: target.url, ...(!queued ? { Warning: '199 - "Post saved; delivery will retry after publication"' } : {}) } });
			}

			const { file } = await find(input.url);
			if (!file) throw new ProtocolError(404, 'invalid_request', 'Post not found');
			const expectedRevision = request.headers.get('If-Match');
			if (expectedRevision && expectedRevision !== `"${file.sha}"`) throw new ProtocolError(412, 'invalid_request', 'Post changed; fetch source before editing');
			const doc = readDocument(file.content);
			const deleted = doc.properties.deleted?.[0] === true;
			let next: string;
			if (action === 'delete') next = updateDocument(file.content, { replace: { deleted: [true] } });
			else if (action === 'undelete') next = updateDocument(file.content, { delete: ['deleted'] });
			else {
				if (deleted) throw new ProtocolError(410, 'invalid_request', 'Restore the post before editing');
				const operations: UpdateOperations = {};
				for (const key of ['replace', 'add', 'delete'] as const) {
					if (input[key] === undefined) continue;
					if (key === 'delete' && Array.isArray(input[key])) {
						publicProperties(Object.fromEntries(input[key].map(name => { if (typeof name !== 'string') throw bad('Invalid deletion'); return [name, []]; })), true);
						operations.delete = input[key] as string[];
					} else {
						const values = record(input[key]) as Properties;
						publicProperties(values, key === 'delete');
						Object.assign(operations, { [key]: values });
					}
				}
				const formProperties = input.properties && typeof input.properties === 'object' && !Array.isArray(input.properties) ? input.properties as Record<string, unknown> : {};
				const requestedValue = input['mp-syndicate-to'] ?? formProperties['mp-syndicate-to'];
				if (requestedValue !== undefined) {
					let requested: ('mastodon' | 'bluesky')[];
					try { requested = requestedSyndication(requestedValue, config); } catch { throw bad('Syndication target is not configured'); }
					operations.replace = { ...operations.replace, syndicationTargets: [...new Set([...(doc.properties.syndicationTargets ?? []), ...requested])] };
				}
				if (!Object.keys(operations).length) throw bad('No update operations');
				const status = operations.replace?.['post-status']?.[0];
				if (status === 'draft') await authorize(request, 'draft', config, upstream, parsed.bodyToken);
				if (status === 'published' && (doc.properties['post-status']?.[0] === 'draft' || doc.properties.draft?.[0] === true)) await authorize(request, 'create', config, upstream, parsed.bodyToken);
				next = updateDocument(file.content, operations);
				// Explicit publication also clears legacy draft metadata.
				if (status === 'published') next = updateDocument(next, { delete: ['draft'] });
			}
			if (action === 'update') {
				const nextDoc = readDocument(next);
				const beforeDraft = doc.properties['post-status']?.[0] === 'draft' || doc.properties.draft?.[0] === true;
				const afterDraft = nextDoc.properties['post-status']?.[0] === 'draft' || nextDoc.properties.draft?.[0] === true;
				if (afterDraft && !beforeDraft) await authorize(request, 'draft', config, upstream, parsed.bodyToken);
				if (beforeDraft && !afterDraft) await authorize(request, 'create', config, upstream, parsed.bodyToken);
			}
			if (next !== file.content) {
				next = updateDocument(next, { replace: { updated: [timestamp(now, config.timeZone)] } });
				const saved = await store.write(file.path, next, { sha: file.sha, expectedHead, message: `${action} post` });
				await queuePublication(config, file.path, next, file.content, saved.commit);
			}
			return new Response(null, { status: 204, headers });
		} catch (error) {
			if (error instanceof ProtocolError) return json({ error: error.code, error_description: error.message }, error.status, error.status === 401 ? { 'WWW-Authenticate': 'Bearer' } : {});
			if (error instanceof GitHubStoreError) return json({ error: error.outcome === 'conflict' ? 'invalid_request' : 'temporarily_unavailable', error_description: error.outcome === 'unknown' ? 'Write outcome unknown; check source before retrying' : 'Content service could not complete the request' }, error.outcome === 'conflict' ? 409 : 503);
			return json({ error: 'invalid_request', error_description: 'Invalid content or request' }, 400);
		}
	};
}

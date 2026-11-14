import { COMPOSER_KINDS, LEG_KEYS, isComposerKind, type ComposerFields, type ComposerKind, type LegFields } from '../../composer-kinds';
import { ProtocolError } from './auth';
import type { Json, Properties } from './document';
import type { PublishingConfig } from './micropub';
import { ownerMicropub } from './post-editor';

export interface MicropubEntry { type: string[]; properties: Properties; 'mp-slug'?: string[]; 'mp-syndicate-to'?: string[] }
export interface Draft { version: 1; id: string; kind: ComposerKind; created: string; updated: string; title: string; fields: ComposerFields; entry?: MicropubEntry }
export interface DraftSummary { id: string; kind: ComposerKind; title: string; updated: string }
interface Dependencies { fetcher?: (url: string, init: RequestInit) => Promise<Response>; now?: () => Date; id?: () => string }

const invalid = (message: string): never => { throw new ProtocolError(422, 'invalid_request', message); };
const text = (value: string | undefined) => value?.replace(/\r\n?/g, '\n').trim() ?? '';
const tags = (value: string | undefined) => [...new Set((value ?? '').split(',').map(tag => tag.trim().replace(/^#/, '')).filter(Boolean))];
const list = (value: unknown) => (Array.isArray(value) ? value : []).filter((item): item is string => typeof item === 'string');

/** Reads the composer form. Repeated fields stay aligned by position. */
export function fieldsFromForm(values: URLSearchParams): ComposerFields {
	const fields: ComposerFields = {};
	for (const key of ['content', 'format', 'name', 'summary', 'category', 'in-reply-to', 'bookmark-of', 'like-of', 'repost-of', 'rsvp', 'start', 'end', 'location', 'location-name', 'item-name', 'item-url', 'rating', 'food-name', 'slug', 'published']) {
		const value = values.get(key);
		if (value !== null) fields[key] = value;
	}
	for (const key of ['photo', 'photo-alt', 'video', 'syndicate-to']) if (values.has(key)) fields[key] = values.getAll(key);
	const columns = LEG_KEYS.map(key => values.getAll(`leg-${key}`));
	const count = Math.max(0, ...columns.map(column => column.length));
	if (count) fields.legs = Array.from({ length: count }, (_, index) => Object.fromEntries(LEG_KEYS.map((key, column) => [key, columns[column][index] ?? ''])) as unknown as LegFields)
		.filter(leg => LEG_KEYS.some(key => key !== 'transit-type' && leg[key].trim()));
	return fields;
}

/** The UTC offset of a zone at an instant, in minutes. */
function offsetAt(ms: number, timeZone: string): number {
	const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms));
	const get = (type: string) => Number(parts.find(part => part.type === type)!.value);
	return (Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - Math.floor(ms / 1000) * 1000) / 60000;
}

/** A `datetime-local` value read as wall-clock time in the site's zone, with its offset. */
export function zonedTimestamp(local: string, timeZone: string): string {
	const match = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
	if (!match) return invalid('Use a valid date and time.');
	const [year, month, day, hour, minute, second = '00'] = match.slice(1);
	const wall = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second);
	let offset = offsetAt(wall, timeZone);
	offset = offsetAt(wall - offset * 60000, timeZone);
	const sign = offset < 0 ? '-' : '+';
	const abs = Math.abs(offset);
	return `${year}-${month}-${day}T${hour}:${minute}:${second}${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

function url(value: string | undefined, label: string, required = true): string | undefined {
	const trimmed = text(value);
	if (!trimmed) return required ? invalid(`${label} needs a URL.`) : undefined;
	try { const parsed = new URL(trimmed); if (['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password) return parsed.href; } catch { /* reported below */ }
	return invalid(`${label} must be an http or https URL.`);
}

function required(value: string | undefined, label: string): string {
	return text(value) || invalid(`${label} is required.`);
}

function location(value: string | undefined): Json | undefined {
	const trimmed = text(value);
	if (!trimmed) return;
	if (/^geo:[+-]?\d+(?:\.\d+)?,[+-]?\d+(?:\.\d+)?(?:;u=\d+(?:\.\d+)?)?$/.test(trimmed)) return trimmed;
	return { type: ['h-card'], properties: { name: [trimmed] } };
}

/**
 * Turn the flat composer form into a Micropub create request. The Micropub
 * endpoint validates the result again before anything is written.
 */
export function entryFromFields(kind: ComposerKind, fields: ComposerFields, timeZone: string): MicropubEntry {
	const properties: Properties = {};
	const set = (key: string, value: Json | undefined) => { if (value !== undefined && value !== '') properties[key] = [value]; };
	const content = text(fields.content);
	const format = fields.format === 'html' || fields.format === 'text' ? fields.format : 'markdown';
	const setContent = (needed = false) => {
		if (!content) { if (needed) invalid('Content is required.'); return; }
		properties.content = [format === 'html' ? { html: content } : content];
		if (format === 'markdown') properties['p3k-content-type'] = ['text/markdown'];
	};
	const local = (value: string | undefined, label: string, needed = false) => {
		const trimmed = text(value);
		if (!trimmed) return needed ? invalid(`${label} is required.`) : undefined;
		return zonedTimestamp(trimmed, timeZone);
	};
	let type = 'h-entry';
	switch (kind) {
		case 'note': set('in-reply-to', url(fields['in-reply-to'], 'Reply to', false)); setContent(!list(fields.photo).length); break;
		case 'article': set('name', required(fields.name, 'Title')); set('summary', text(fields.summary)); setContent(true); break;
		case 'reply': set('in-reply-to', url(fields['in-reply-to'], 'Reply to')); setContent(true); break;
		case 'bookmark': set('bookmark-of', url(fields['bookmark-of'], 'Bookmark URL')); set('name', text(fields.name)); setContent(); break;
		case 'like': set('like-of', url(fields['like-of'], 'Like of')); break;
		case 'repost': set('repost-of', url(fields['repost-of'], 'Repost of')); setContent(); break;
		case 'rsvp': {
			set('in-reply-to', url(fields['in-reply-to'], 'Event URL'));
			if (!['yes', 'no', 'maybe', 'interested'].includes(fields.rsvp ?? '')) invalid('Choose an RSVP.');
			set('rsvp', fields.rsvp); setContent(); break;
		}
		case 'photo': if (!list(fields.photo).length) invalid('Add at least one photo.'); setContent(); break;
		case 'video': if (!list(fields.video).length) invalid('Add a video.'); setContent(); break;
		case 'event': {
			type = 'h-event';
			set('name', required(fields.name, 'Event name'));
			set('start', local(fields.start, 'Start', true)); set('end', local(fields.end, 'End'));
			set('location', location(fields['location-name'])); setContent(); break;
		}
		case 'review': {
			type = 'h-review';
			const item: Properties = { name: [required(fields['item-name'], 'Item name')] };
			const itemUrl = url(fields['item-url'], 'Item URL', false);
			if (itemUrl) item.url = [itemUrl];
			set('item', { type: ['h-product'], properties: item });
			set('name', text(fields.name));
			if (text(fields.rating)) {
				const rating = Number(fields.rating);
				if (!Number.isInteger(rating) || rating < 1 || rating > 5) invalid('Rate from one to five stars.');
				Object.assign(properties, { rating: [rating], best: [5], worst: [1] });
			}
			setContent(); break;
		}
		case 'itinerary': {
			const legs = fields.legs ?? [];
			if (!legs.length) invalid('Add at least one leg.');
			properties.itinerary = legs.map((leg, index) => {
				const leg_: Properties = {};
				for (const key of ['transit-type', 'operator', 'number'] as const) if (text(leg[key])) leg_[key] = [text(leg[key])];
				leg_.origin = [required(leg.origin, `Leg ${index + 1} origin`)];
				leg_.destination = [required(leg.destination, `Leg ${index + 1} destination`)];
				leg_.departure = [local(leg.departure, `Leg ${index + 1} departure`, true)!];
				leg_.arrival = [local(leg.arrival, `Leg ${index + 1} arrival`, true)!];
				return { type: ['h-leg'], properties: leg_ };
			});
			setContent(); break;
		}
		case 'food': case 'drink':
			set(kind === 'food' ? 'ate' : 'drank', { type: ['h-food'], properties: { name: [required(fields['food-name'], kind === 'food' ? 'What you ate' : 'What you drank')] } });
			setContent(); break;
	}
	if (kind !== 'event') set('location', location(fields.location));
	const category = tags(fields.category);
	if (category.length) properties.category = category;
	const photos = list(fields.photo), alts = list(fields['photo-alt']);
	if (photos.length && !['like', 'repost', 'video'].includes(kind)) properties.photo = photos.map((photo, index) => {
		const value = url(photo, 'Photo')!;
		return text(alts[index]) ? { value, alt: text(alts[index]) } : value;
	});
	const videos = list(fields.video);
	if (videos.length && kind === 'video') properties.video = videos.map(video => url(video, 'Video')!);
	const published = local(fields.published, 'Published');
	if (published) properties.published = [published];
	properties['post-status'] = ['published'];
	const entry: MicropubEntry = { type: [type], properties };
	const slug = text(fields.slug);
	if (slug) {
		if (!/^[\p{L}\p{N}][\p{L}\p{N}-]{0,119}$/u.test(slug)) invalid('Use letters, numbers and hyphens in the slug.');
		entry['mp-slug'] = [slug];
	}
	const targets = list(fields['syndicate-to']);
	if (targets.length) entry['mp-syndicate-to'] = targets;
	return entry;
}

/** A short label for the drafts list. */
export function draftTitle(kind: ComposerKind, fields: ComposerFields): string {
	const first = [fields.name, fields['item-name'], fields['food-name'], fields.content, fields['bookmark-of'], fields['in-reply-to'], fields['like-of'], fields['repost-of'], fields.legs?.[0] && `${fields.legs[0].origin} → ${fields.legs[0].destination}`]
		.map(value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '').find(Boolean);
	return first ? (first.length > 80 ? `${first.slice(0, 79)}…` : first) : `Untitled ${COMPOSER_KINDS[kind].label.toLowerCase()}`;
}

/** Publish through the site's own Micropub endpoint as the signed-in owner. */
export async function publishEntry(config: PublishingConfig, entry: MicropubEntry, dependencies: Dependencies = {}): Promise<string> {
	const micropub = ownerMicropub(config, dependencies, 'create');
	const response = await micropub('', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) });
	return response.headers.get('Location') ?? config.me;
}

export interface DraftStoreConfig { owner: string; repo: string; branch: string; token: string }

/** Drafts live as JSON files in a private GitHub repository, outside the public content repo. */
export function createDraftStore(config: DraftStoreConfig, dependencies: Dependencies = {}) {
	for (const value of [config.owner, config.repo]) if (!/^[\w.-]+$/.test(value) || value === '.' || value === '..') throw new Error('Invalid drafts repository');
	const fetcher = dependencies.fetcher ?? fetch;
	const endpoint = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/drafts`;
	const headers = { Authorization: `Bearer ${config.token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'caseyagollan-publishing' };
	const path = (id: string) => {
		if (!/^[a-z0-9][a-z0-9-]{7,63}$/.test(id)) throw new ProtocolError(404, 'invalid_request', 'Draft not found.');
		return `${endpoint}/${id}.json`;
	};
	const call = async (target: string, init: RequestInit = {}) => {
		try { return await fetcher(target, { ...init, headers, cache: 'no-store', signal: AbortSignal.timeout(8000) }); }
		catch { throw new ProtocolError(503, 'temporarily_unavailable', 'The drafts repository could not be reached.'); }
	};
	const unavailable = (response: Response) => new ProtocolError(response.status === 409 || response.status === 422 ? 409 : 503, 'temporarily_unavailable',
		response.status === 409 || response.status === 422 ? 'The draft changed since you opened it. Reload to see the latest version.' : response.status === 404 ? 'The drafts repository was not found, or the token cannot read it.' : 'The drafts repository is unavailable.');
	const decode = (content: string) => new TextDecoder().decode(Uint8Array.from(atob(content.replace(/\s/g, '')), char => char.charCodeAt(0)));
	const encode = (content: string) => btoa(Array.from(new TextEncoder().encode(content), byte => String.fromCharCode(byte)).join(''));
	const ref = `?ref=${encodeURIComponent(config.branch)}`;

	async function read(id: string): Promise<{ draft: Draft; sha: string } | null> {
		const response = await call(path(id) + ref);
		if (response.status === 404) return null;
		if (!response.ok) throw unavailable(response);
		const file = await response.json() as { sha?: string; content?: string; encoding?: string };
		if (typeof file.sha !== 'string' || typeof file.content !== 'string' || file.encoding !== 'base64') throw unavailable(response);
		const draft = JSON.parse(decode(file.content)) as Draft;
		if (draft?.version !== 1 || draft.id !== id || !isComposerKind(draft.kind) || !draft.fields || typeof draft.fields !== 'object') throw new ProtocolError(422, 'invalid_request', 'This draft file is not in a format the composer can open.');
		return { draft, sha: file.sha };
	}

	return {
		read,
		async list(): Promise<DraftSummary[]> {
			const response = await call(endpoint + ref);
			if (response.status === 404) {
				// An empty repository has no drafts folder; a missing repository is an error.
				const repo = await call(`https://api.github.com/repos/${config.owner}/${config.repo}`);
				if (repo.ok) return [];
				throw unavailable(repo);
			}
			if (!response.ok) throw unavailable(response);
			const entries = (await response.json() as { name?: string; type?: string }[]).filter(entry => entry.type === 'file' && /^[a-z0-9][a-z0-9-]{7,63}\.json$/.test(entry.name ?? '')).slice(0, 100);
			const drafts = await Promise.all(entries.map(entry => read(entry.name!.slice(0, -5)).catch(() => null)));
			return drafts.flatMap(item => item ? [{ id: item.draft.id, kind: item.draft.kind, title: item.draft.title, updated: item.draft.updated }] : []).sort((a, b) => b.updated.localeCompare(a.updated));
		},
		async save(kind: ComposerKind, fields: ComposerFields, existing?: { id: string; sha: string; created: string }, entry?: MicropubEntry): Promise<{ id: string; sha: string }> {
			const now = (dependencies.now?.() ?? new Date()).toISOString();
			const id = existing?.id ?? `${now.slice(0, 10).replaceAll('-', '')}-${dependencies.id?.() ?? crypto.randomUUID().slice(0, 8)}`;
			const draft: Draft = { version: 1, id, kind, created: existing?.created ?? now, updated: now, title: draftTitle(kind, fields), fields, ...(entry ? { entry } : {}) };
			const body = `${JSON.stringify(draft, null, '\t')}\n`;
			if (new TextEncoder().encode(body).length > 512 * 1024) invalid('The draft is too large to save.');
			const response = await call(path(id), { method: 'PUT', body: JSON.stringify({ message: `${existing ? 'Update' : 'Save'} draft: ${draft.title}`, branch: config.branch, content: encode(body), ...(existing ? { sha: existing.sha } : {}) }) });
			if (!response.ok) throw unavailable(response);
			const result = await response.json() as { content?: { sha?: string } };
			return { id, sha: result.content?.sha ?? '' };
		},
		async remove(id: string, sha: string, title: string): Promise<void> {
			const response = await call(path(id), { method: 'DELETE', body: JSON.stringify({ message: `Remove draft: ${title}`, branch: config.branch, sha }) });
			if (!response.ok && response.status !== 404) throw unavailable(response);
		}
	};
}

/** Read a urlencoded form body without buffering more than `limit` bytes. */
export async function readForm(request: Request, limit = 512 * 1024): Promise<URLSearchParams> {
	if (request.headers.get('content-type')?.split(';')[0] !== 'application/x-www-form-urlencoded') throw new ProtocolError(415, 'invalid_request', 'Submit the post form.');
	const reader = request.body?.getReader();
	const decoder = new TextDecoder();
	let body = '', size = 0;
	if (reader) while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > limit) { await reader.cancel(); throw new ProtocolError(413, 'invalid_request', 'The post is too large to send from this form.'); }
		body += decoder.decode(value, { stream: true });
	}
	return new URLSearchParams(body + decoder.decode());
}

/** Prefill from a bookmarklet or share link, the way Quill's /bookmark and /new accept query parameters. */
export function fieldsFromQuery(kind: ComposerKind, query: URLSearchParams): ComposerFields {
	const fields: ComposerFields = {};
	const pick = (...names: string[]) => names.map(name => query.get(name)).find(value => value?.trim())?.trim();
	const link = pick('url', 'u');
	const key = { bookmark: 'bookmark-of', like: 'like-of', repost: 'repost-of', reply: 'in-reply-to', rsvp: 'in-reply-to', note: 'in-reply-to' }[kind as string];
	for (const name of ['bookmark-of', 'like-of', 'repost-of', 'in-reply-to']) { const value = pick(name); if (value) fields[name] = value; }
	if (key && link && !fields[key]) fields[key] = link;
	const title = pick('title', 'name');
	if (title) fields.name = title;
	const content = pick('content', 'text', 'selection');
	if (content) fields.content = kind === 'bookmark' && !query.has('content') ? `> ${content.replace(/\n/g, '\n> ')}` : content;
	const category = pick('category', 'tags');
	if (category) fields.category = category;
	return fields;
}

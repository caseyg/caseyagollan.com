/**
 * Writes the site's Standard.site records to Casey's AT Protocol repository: one
 * `site.standard.publication` for the site and one `site.standard.document` per public article.
 *
 * Each record's key is fixed by the post (see `$lib/standard-site.ts`), so pages link to their
 * record at build time and a write always overwrites the same record. What was last written is
 * kept in the private state bucket; a record is only written again when its content changes, so
 * a quiet five-minute run signs in to nothing. A document whose article is gone is deleted.
 */
import { DeliveryError, safePublicFetch, safePublicImageFetch, type PublicFetcher } from './public-fetch';
import { checkDeliveryResponse } from './webmention';
import { blueskySession, type BlueskySession, type LinkCard, type StrongRef, type SyndicationConfig } from './syndication';
import type { Publication, StandardDocument } from './publication';
import { SITE_IDENTITY } from '../../identity';
import { ATPROTO_DID, DOCUMENT_COLLECTION, PUBLICATION_COLLECTION, PUBLICATION_RKEY, PUBLICATION_URI, PUBLICATION_URL } from '../../standard-site';

const STATE_KEY = 'private/standard-site.json';
/** The square image Bluesky shows beside the publication's name. */
const ICON_URL = new URL('/author-avatar.webp', SITE_IDENTITY.url).href;
/** Writes in one run, so a backfill spreads over a few runs instead of one long one. */
const WRITES_PER_RUN = 6;

interface Written { hash: string; cid: string }
interface StandardState {
	publication?: Written & { icon?: unknown };
	documents: Record<string, Written & { url: string }>;
}
export interface StandardSiteDependencies { fetcher?: PublicFetcher; imageFetcher?: PublicFetcher; session?: BlueskySession }

const rgb = (r: number, g: number, b: number) => ({ $type: 'site.standard.theme.color#rgb', r, g, b });
/** The site's colours, from the tokens in app.css: gray page, white text, blue links. */
const basicTheme = { $type: 'site.standard.theme.basic', background: rgb(128, 128, 128), foreground: rgb(255, 255, 255), accent: rgb(0, 0, 255), accentForeground: rgb(255, 255, 255) };

export function publicationRecord(icon?: unknown): Record<string, unknown> {
	return {
		$type: PUBLICATION_COLLECTION, url: PUBLICATION_URL, name: SITE_IDENTITY.name, description: SITE_IDENTITY.note,
		basicTheme, preferences: { showInDiscover: true }, ...(icon ? { icon } : {})
	};
}

export function documentRecord(document: StandardDocument, textContent: string, bskyPostRef?: StrongRef): Record<string, unknown> {
	return {
		$type: DOCUMENT_COLLECTION, site: PUBLICATION_URI, path: document.path, title: document.title,
		...(document.description ? { description: document.description } : {}),
		...(textContent ? { textContent } : {}),
		...(document.tags?.length ? { tags: document.tags } : {}),
		publishedAt: document.publishedAt,
		...(document.updatedAt ? { updatedAt: document.updatedAt } : {}),
		...(bskyPostRef ? { bskyPostRef } : {})
	};
}

const sha = async (value: unknown) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)))), byte => byte.toString(16).padStart(2, '0')).join('');

async function xrpc(fetcher: PublicFetcher, session: BlueskySession, method: string, body: unknown): Promise<Record<string, unknown>> {
	const response = await fetcher(`${session.base}/xrpc/${method}`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json', authorization: `Bearer ${session.accessJwt}` }, body: JSON.stringify(body) });
	checkDeliveryResponse(response);
	try { return await response.json() as Record<string, unknown>; } catch { throw new DeliveryError('Invalid AT Protocol response', true); }
}
/** No `validate`: the PDS has no copy of the Standard.site lexicons, so it stores them as given. */
async function putRecord(fetcher: PublicFetcher, session: BlueskySession, collection: string, rkey: string, record: unknown): Promise<string> {
	const result = await xrpc(fetcher, session, 'com.atproto.repo.putRecord', { repo: session.did, collection, rkey, record });
	if (typeof result.cid !== 'string') throw new DeliveryError('The PDS did not return a record CID', true);
	return result.cid;
}

async function uploadIcon(fetcher: PublicFetcher, imageFetcher: PublicFetcher, session: BlueskySession): Promise<unknown> {
	const image = await imageFetcher(ICON_URL, { redirect: 'manual' });
	checkDeliveryResponse(image);
	const bytes = new Uint8Array(await image.arrayBuffer());
	if (bytes.byteLength > 1_000_000) throw new DeliveryError('Publication icon is larger than 1 MB', false);
	const response = await fetcher(`${session.base}/xrpc/com.atproto.repo.uploadBlob`, { method: 'POST', redirect: 'manual', headers: { authorization: `Bearer ${session.accessJwt}`, 'content-type': image.headers.get('content-type') ?? 'image/webp' }, body: bytes });
	checkDeliveryResponse(response);
	const result = await response.json() as { blob?: unknown };
	if (!result.blob || typeof result.blob !== 'object') throw new DeliveryError('The PDS did not return a blob', true);
	return result.blob;
}

/** The post's own Bluesky copy as a strong reference, read from the public repository. */
async function bskyPostRef(fetcher: PublicFetcher, session: BlueskySession, url: string | undefined): Promise<StrongRef | undefined> {
	const match = url?.match(/^https:\/\/bsky\.app\/profile\/([^/]+)\/post\/([a-z2-7]{13})\/?$/);
	if (!match || (match[1] !== session.did && match[1] !== session.handle)) return;
	const response = await fetcher(`${session.base}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(session.did)}&collection=app.bsky.feed.post&rkey=${match[2]}`, { redirect: 'manual' });
	if (response.status === 400 || response.status === 404) return;
	checkDeliveryResponse(response);
	const result = await response.json() as { uri?: unknown; cid?: unknown };
	return typeof result.uri === 'string' && typeof result.cid === 'string' ? { uri: result.uri, cid: result.cid } : undefined;
}

/** Holds the state and one lazy sign-in for a run, and saves the state as each record is written. */
class Writer {
	private session?: BlueskySession;
	constructor(private bucket: R2Bucket, private config: SyndicationConfig, private etag: string | undefined, readonly state: StandardState, private dependencies: StandardSiteDependencies) { this.session = dependencies.session; }
	static async open(bucket: R2Bucket, config: SyndicationConfig, dependencies: StandardSiteDependencies = {}): Promise<Writer> {
		const stored = await bucket.get(STATE_KEY);
		const state = stored ? await stored.json<Partial<StandardState>>() : {};
		return new Writer(bucket, config, stored?.etag, { ...state, documents: state.documents ?? {} }, dependencies);
	}
	get fetcher() { return this.dependencies.fetcher ?? safePublicFetch; }
	/** The session this run signed in with, if it needed one. */
	get signedIn(): BlueskySession | undefined { return this.session; }
	async signIn(): Promise<BlueskySession> {
		if (this.session) return this.session;
		const session = await blueskySession(this.config, this.fetcher);
		// Pages name records in this repository; never write them anywhere else.
		if (session.did !== ATPROTO_DID) throw new DeliveryError('Bluesky account is not the site’s AT Protocol identity', false);
		return this.session = session;
	}
	async save(): Promise<void> {
		const written = await this.bucket.put(STATE_KEY, JSON.stringify(this.state), { onlyIf: this.etag ? { etagMatches: this.etag } : { etagDoesNotMatch: '*' } });
		if (!written) throw new DeliveryError('Standard.site state raced another write', true);
		this.etag = written.etag;
	}
	/** Writes the publication if it's missing or has changed. */
	async publication(): Promise<StrongRef> {
		const hash = await sha(publicationRecord(ICON_URL));
		const known = this.state.publication;
		if (known?.hash === hash) return { uri: PUBLICATION_URI, cid: known.cid };
		const session = await this.signIn();
		const icon = await uploadIcon(this.fetcher, this.dependencies.imageFetcher ?? safePublicImageFetch, session);
		const cid = await putRecord(this.fetcher, session, PUBLICATION_COLLECTION, PUBLICATION_RKEY, publicationRecord(icon));
		this.state.publication = { hash, cid, icon };
		await this.save();
		return { uri: PUBLICATION_URI, cid };
	}
	/** Writes an article's document if it's missing or has changed. Returns whether it wrote. */
	async document(publication: Pick<Publication, 'url' | 'text' | 'document'>): Promise<{ ref: StrongRef; wrote: boolean }> {
		const document = publication.document!;
		const uri = `at://${ATPROTO_DID}/${DOCUMENT_COLLECTION}/${document.rkey}`;
		// The Bluesky link is part of the hash, so a post that gains one is written again with its reference.
		const hash = await sha(documentRecord(document, publication.text, document.bskyPost ? { uri: document.bskyPost, cid: '' } : undefined));
		const known = this.state.documents[document.rkey];
		if (known?.hash === hash) return { ref: { uri, cid: known.cid }, wrote: false };
		await this.publication();
		const session = await this.signIn();
		const ref = await bskyPostRef(this.fetcher, session, document.bskyPost);
		const cid = await putRecord(this.fetcher, session, DOCUMENT_COLLECTION, document.rkey, documentRecord(document, publication.text, ref));
		this.state.documents[document.rkey] = { hash, cid, url: publication.url };
		await this.save();
		return { ref: { uri, cid }, wrote: true };
	}
	async remove(rkey: string): Promise<void> {
		await xrpc(this.fetcher, await this.signIn(), 'com.atproto.repo.deleteRecord', { repo: ATPROTO_DID, collection: DOCUMENT_COLLECTION, rkey });
		delete this.state.documents[rkey];
		await this.save();
	}
}

/**
 * Bring the records in line with the public articles: write new and changed documents, and
 * delete those whose article is gone. Runs after each publication scan, so it also backfills.
 */
export async function syncStandardSite(bucket: R2Bucket, config: SyndicationConfig, publications: Publication[], dependencies: StandardSiteDependencies = {}): Promise<{ written: number; removed: number }> {
	const writer = await Writer.open(bucket, config, dependencies);
	const articles = publications.filter(publication => publication.document);
	const present = new Set(articles.map(publication => publication.document!.rkey));
	let budget = WRITES_PER_RUN, written = 0, removed = 0;
	for (const article of articles) {
		if (budget <= 0) break;
		if ((await writer.document(article)).wrote) { written++; budget--; }
	}
	for (const rkey of Object.keys(writer.state.documents)) {
		if (budget-- <= 0) break;
		if (!present.has(rkey)) { await writer.remove(rkey); removed++; }
	}
	return { written, removed };
}

/**
 * The link card for an article's Bluesky post. The document and publication are written first,
 * so the card can name them; Bluesky draws its richer Standard.site card from those references.
 */
export async function standardSiteCard(bucket: R2Bucket, config: SyndicationConfig, publication: Pick<Publication, 'url' | 'text' | 'document'>, dependencies: StandardSiteDependencies = {}): Promise<{ card: LinkCard; session?: BlueskySession }> {
	const document = publication.document!;
	const writer = await Writer.open(bucket, config, dependencies);
	const { ref } = await writer.document(publication);
	const site = await writer.publication();
	return {
		card: { uri: publication.url, title: document.title, description: document.description ?? '', associatedRefs: [ref, site] },
		session: writer.signedIn
	};
}

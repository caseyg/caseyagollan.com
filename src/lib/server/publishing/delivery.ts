import { fromHtml } from 'hast-util-from-html';
import type { Nodes } from 'hast';
import type { PublishingConfig } from './micropub';
import { parsePost, isPublicPost } from '../parse-post';
import { publicationForPost, publicationRevision, type Publication } from './publication';
import { enqueueDelivery, processOutbox, type DeliveryEvent, type OutboxJob, type DeliveryProgress } from './outbox';
import { createGitHubStore } from './github';
import { updateDocument, readDocument } from './document';
import { DeliveryError, publicUrl, safePublicFetch, type PublicFetcher } from './public-fetch';
import { sendWebmention } from './webmention';
import { syndicate, syndicationKey, type SentPart, type SyndicationConfig } from './syndication';
import { PHOTO_LIMITS } from '../../social-text';
import { preparePhotos, type PhotoSources, type PreparedPhoto, type SyndicationPhoto } from './syndication-photos';
import { editorPhotos, photosWithAlts } from './photo-properties';
import { storedPhotoPosts, storedThread, threadUpdate } from './syndication-thread';

type Service = 'mastodon' | 'bluesky';
const services = ['mastodon', 'bluesky'] as const;
export function syndicationTargets(config: PublishingConfig): { uid: string; name: string }[] {
 return services.filter(service => config.syndication?.[service] && config.state).map(service => ({ uid: new URL(`/syndication/${service}`, config.me).href, name: service === 'mastodon' ? 'Mastodon' : 'Bluesky' }));
}
export function requestedSyndication(value: unknown, config: PublishingConfig): Service[] {
 if (value === undefined) return [];
 if (!Array.isArray(value) || value.some(uid => typeof uid !== 'string')) throw new Error('Use an array of syndication target URLs');
 const advertised = syndicationTargets(config);
 return [...new Set(value.map(uid => {
  const target = advertised.find(item => item.uid === uid);
  if (!target) throw new Error('Syndication target is not configured');
  return uid.endsWith('/mastodon') ? 'mastodon' as const : 'bluesky' as const;
 }))];
}
const splitPath = (path: string) => { const index = path.indexOf('/'); return [path.slice(0, index), path.slice(index + 1)] as const; };
const visible = (post: ReturnType<typeof parsePost>) => !post.draft && isPublicPost(post);
const hash = async (text: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), byte => byte.toString(16).padStart(2,'0')).join('');
function eventFor(publication: Publication, previous?: Publication, action: 'publish' | 'remove' = 'publish', generation?: string): DeliveryEvent {
 return { source: publication.url, revision: publication.revision, generation, action, targets: [...new Set([...publication.targets, ...(previous?.targets ?? [])])], syndicateTo: action === 'publish' ? publication.syndicateTo.filter((service): service is Service => services.includes(service as Service)) : [], text: publication.text, title: publication.title, published: publication.published, sourcePath: publication.sourcePath, ...(publication.previousUrls?.length ? { previousSources: publication.previousUrls } : {}), ...(action === 'publish' && publication.photos?.length ? { photos: publication.photos } : {}), ...(action === 'publish' && publication.thread ? { thread: publication.thread } : {}) };
}

/** The request path and manifest recovery share a durable transition before enqueue.
 * Saving the full event first also recovers a crash between intent and job creation. */
async function queueTransition(bucket: R2Bucket, event: DeliveryEvent, now = Date.now()): Promise<void> {
 const key = `private/transitions/${await hash(event.source)}.json`;
 for (let attempt = 0; attempt < 4; attempt++) {
  const stored = await bucket.get(key);
  const previous = stored ? await stored.json<DeliveryEvent>() : undefined;
  const recovering = event.generation?.startsWith('scan:');
  const same = previous?.action === event.action && (event.action === 'remove' || (previous.revision === event.revision && JSON.stringify(previous.syndicateTo) === JSON.stringify(event.syndicateTo)));
  if (previous && same && (recovering || previous.generation === event.generation)) {
   await enqueueDelivery(bucket, previous, now); return;
  }
  const written = await bucket.put(key, JSON.stringify(event), { onlyIf: stored ? { etagMatches: stored.etag } : { etagDoesNotMatch: '*' } });
  if (!written) continue;
  await enqueueDelivery(bucket, event, now); return;
 }
 throw new DeliveryError('Publication transition raced', true);
}

/** Git is authoritative; a failed immediate enqueue is recovered from the next public manifest. */
export async function queuePublication(config: PublishingConfig, path: string, markdown: string, previous?: string, generation?: string, previousPath = path): Promise<boolean> {
 if (!config.state) return true;
 const [folder,file] = splitPath(path);
 const post = parsePost(markdown, folder, file);
 const old = previous === undefined ? undefined : parsePost(previous, ...splitPath(previousPath));
 if (!visible(post) && (!old || !visible(old))) return true;
 const current = await publicationForPost(post, config.me);
 const before = old ? await publicationForPost(old, config.me) : undefined;
 const event = eventFor(current, before, visible(post) ? 'publish' : 'remove', generation);
 if (!event.targets.length && !event.syndicateTo.length) return true;
 try { await queueTransition(config.state, event); return true; }
 catch { console.warn(JSON.stringify({ event: 'publishing_delivery_deferred' })); return false; }
}

/** First run seeds history without broadcasting old links; explicit syndication requests are retained. */
export async function reconcilePublications(bucket: R2Bucket, current: Publication[], now = Date.now()): Promise<void> {
 if (current.length > 5000) throw new DeliveryError('Publication manifest is too large', false);
 const key = 'private/publication-manifest.json';
 const stored = await bucket.get(key);
 const snapshot = stored ? await stored.json<Publication[] | { publications: Publication[]; generation: number }>() : undefined;
 const previous = snapshot ? (Array.isArray(snapshot) ? snapshot : snapshot.publications) : [];
 const generation = (snapshot && !Array.isArray(snapshot) ? snapshot.generation : 0) + 1;
 const prior = new Map(previous.map(publication => [publication.url, publication]));
 // A renamed post's old address redirects; it is the same publication, not a removal.
 const present = new Set(current.flatMap(publication => [publication.url, ...(publication.previousUrls ?? [])]));
 for (const publication of current) {
  const old = prior.get(publication.url) ?? (publication.previousUrls ?? []).map(url => prior.get(url)).find(Boolean);
  if ((!stored && publication.syndicateTo.length) || (stored && (!old || old.revision !== publication.revision || JSON.stringify(old.syndicateTo) !== JSON.stringify(publication.syndicateTo)))) {
   const event = eventFor(publication, old, 'publish', `scan:${generation}`);
   if (event.targets.length || event.syndicateTo.length) await queueTransition(bucket, event, now);
  }
 }
 for (const old of previous) if (!present.has(old.url) && old.targets.length) await queueTransition(bucket, eventFor(old, undefined, 'remove', `scan:${generation}`), now);
 const written = await bucket.put(key, JSON.stringify({ publications: current, generation }), { onlyIf: stored ? { etagMatches: stored.etag } : { etagDoesNotMatch: '*' } });
 if (!written) throw new DeliveryError('Publication scan raced another scan', true);
}

function revisionFromHtml(html: string): string | undefined {
 let revision: string | undefined;
 function visit(node: Nodes): void {
  if (node.type === 'element' && node.tagName === 'meta' && node.properties.name === 'publishing-revision' && typeof node.properties.content === 'string') revision = node.properties.content;
  if ('children' in node) node.children.forEach(visit);
 }
 visit(fromHtml(html)); return revision;
}
export interface SyndicationReceipt {
 status: 'sending' | 'sent'; startedAt: number; leaseUntil: number; url?: string; draft?: string;
 /** A reviewed thread, kept like `draft` so a retry sends what was reviewed. */
 thread?: string[];
 /** The thread's posts sent so far, so a retry continues instead of starting over. */
 parts?: SentPart[];
 /** The photos chosen for this copy, so a retry sends the same ones. */
 photos?: SyndicationPhoto[];
}
/** What a manual send chose: its text, its photos, and the photos already read for it. */
export interface SyndicationChoice { draft?: string | string[]; photos?: SyndicationPhoto[]; prepared?: PreparedPhoto[] }
/** Up to `count` photos on each post of a thread, in order. */
function firstPerPost<T extends { post?: number }>(photos: T[], count: number): T[] {
 const seen = new Map<number, number>();
 return photos.filter(photo => { const n = (seen.get(photo.post ?? 0) ?? 0) + 1; seen.set(photo.post ?? 0, n); return n <= count; });
}
export async function syndicationReceiptKey(source: string, service: Service): Promise<string> {
 return `private/syndication/${await hash(`${source}\0${service}`)}.json`;
}
export async function readSyndicationReceipt(bucket: R2Bucket, source: string, service: Service, previousSources: string[] = []): Promise<SyndicationReceipt | undefined> {
 const stored = await bucket.get(await syndicationReceiptKey(source, service));
 if (stored) return stored.json<SyndicationReceipt>();
 // A post sent before its slug changed was sent under its old address.
 for (const previous of previousSources) {
  const receipt = await bucket.get(await syndicationReceiptKey(previous, service));
  const sent = receipt ? await receipt.json<SyndicationReceipt>() : undefined;
  if (sent?.status === 'sent' && sent.url) return sent;
 }
}
export async function syndicationOnce(bucket: R2Bucket, event: DeliveryEvent, service: Service, config: SyndicationConfig, fetcher: PublicFetcher, now: () => number, draft?: string | string[], choice: SyndicationChoice & { sources?: PhotoSources } = {}): Promise<string> {
 const identity = await hash(`${event.source}\0${service}`);
 const key = `private/syndication/${identity}.json`;
 const stored = await bucket.get(key);
 const receipt = stored ? await stored.json<SyndicationReceipt>() : undefined;
 // A retry keeps the photos of the first attempt; automatic sends take the first four of each post.
 const photos = receipt?.photos ?? choice.photos ?? firstPerPost(event.photos ?? [], PHOTO_LIMITS[service].count);
 if (receipt?.status === 'sent' && receipt.url) return receipt.url;
 if (!receipt && event.previousSources?.length) {
  // Never send a renamed post again: a receipt under an old address is this post's receipt.
  const moved = await readSyndicationReceipt(bucket, event.source, service, event.previousSources);
  if (moved?.status === 'sent' && moved.url) {
   await bucket.put(key, JSON.stringify(moved), { onlyIf: { etagDoesNotMatch: '*' } });
   return moved.url;
  }
 }
 if (receipt && receipt.leaseUntil > now()) throw new DeliveryError('Syndication is leased', true);
 // Mastodon keeps idempotency keys for one hour. Never risk a duplicate outside that window.
 const startedAt = receipt?.startedAt ?? now();
 if (service === 'mastodon' && now() - startedAt >= 45 * 60_000) throw new DeliveryError('Mastodon outcome requires manual reconciliation', false);
 // The first reviewed text wins through retries, whether a post or a thread.
 // Automatic sends use the post's stored thread, if it has one.
 const chosen = choice.draft ?? draft ?? event.thread;
 const offered = Array.isArray(chosen) ? (chosen.length > 1 ? { thread: chosen } : { draft: chosen[0] }) : { draft: chosen };
 const original = receipt?.thread?.length ? { thread: receipt.thread } : receipt?.draft !== undefined ? { draft: receipt.draft } : offered;
 // Read and fit the photos before claiming, so a photo that cannot be sent leaves nothing to review.
 const media = photos.length ? (choice.prepared && choice.photos === photos ? choice.prepared : await preparePhotos(service, photos, choice.sources ?? {})) : undefined;
 const kept = { ...original, ...(photos.length ? { photos } : {}) };
 let parts = receipt?.parts ?? [];
 let claim = await bucket.put(key, JSON.stringify({ status: 'sending', startedAt, leaseUntil: now() + 300_000, ...kept, ...(parts.length ? { parts } : {}) }), { onlyIf: stored ? { etagMatches: stored.etag } : { etagDoesNotMatch: '*' } });
 if (!claim) throw new DeliveryError('Syndication claim raced', true);
 const progress = { parts, async save(sent: SentPart[]) {
  parts = sent;
  // Each saved post also renews the lease, so a long thread is not claimed twice.
  const saved = await bucket.put(key, JSON.stringify({ status: 'sending', startedAt, leaseUntil: now() + 300_000, ...kept, parts }), { onlyIf: { etagMatches: claim!.etag } });
  if (!saved) throw new DeliveryError('Syndication receipt raced', true);
  claim = saved;
 } };
 const url = await syndicate(service, { url: event.source, text: event.text, title: event.title, published: event.published, idempotencyKey: identity, ...original, media }, config, fetcher, progress);
 const saved = await bucket.put(key, JSON.stringify({ status: 'sent', startedAt, leaseUntil: 0, url, ...kept, ...(parts.length ? { parts } : {}) }), { onlyIf: { etagMatches: claim.etag } });
 if (!saved) throw new DeliveryError('Syndication receipt raced', true);
 return url;
}

/** What the syndicate page edits on the post: alt text and thread post by photo URL, and the thread. */
export interface SyndicationEdits { alts?: Record<string, string>; photoPosts?: Record<string, number>; thread?: string[] }
/**
 * Save the social links on the post. `edits` also saves alt text, the thread, and which
 * post each photo goes on, as edited while syndicating, in the same commit.
 */
export async function recordSyndicationResults(config: PublishingConfig, event: DeliveryEvent, progress: DeliveryProgress, fetcher: typeof fetch, edits: SyndicationEdits = {}): Promise<boolean> {
 const alts = edits.alts ?? {};
 // A thread is saved as every one of its posts, first post first, so the post links the whole thread.
 const urls: string[] = [];
 for (const [service, url] of Object.entries(progress.syndication) as [Service, string][]) {
  const receipt = config.state ? await readSyndicationReceipt(config.state, event.source, service, event.previousSources) : undefined;
  const parts = receipt?.status === 'sent' && receipt.url === url ? receipt.parts?.map(part => part.url) ?? [] : [];
  urls.push(url, ...parts.filter(part => part !== url));
 }
 if (!urls.length && !edits.alts && !edits.thread && !edits.photoPosts) return true;
 if (!event.sourcePath) return false;
 const store = createGitHubStore(config, fetcher);
 const head = await store.head();
 const file = await store.read(event.sourcePath);
 if (!file) return false;
 const [folder,name] = splitPath(file.path);
 const post = parsePost(file.content, folder, name);
 if (!visible(post) || await publicationRevision(post) !== event.revision) return false;
 const properties = readDocument(file.content).properties;
 const existing = properties.syndication ?? [];
 // A post already linked under another form of the same URL (Bluesky DID vs handle) is not added twice.
 const known = new Set(existing.map(value => syndicationKey(String(value))));
 const missing = urls.filter(url => !known.has(syndicationKey(url)));
 const stored = editorPhotos(properties);
 const changedAlts = stored.some(photo => alts[photo.url] !== undefined && alts[photo.url] !== photo.alt);
 // The thread and photo placement are stored only when they differ from what the post has.
 const oldPosts = storedPhotoPosts(properties);
 const photoPosts = edits.photoPosts ? stored.map((photo, index) => edits.photoPosts![photo.url] ?? oldPosts[index] ?? 0) : undefined;
 const thread = edits.thread && JSON.stringify(edits.thread.length > 1 ? edits.thread : []) !== JSON.stringify(storedThread(properties) ?? []) ? edits.thread : undefined;
 const placed = photoPosts && JSON.stringify(photoPosts.some(Boolean) ? photoPosts : []) !== JSON.stringify(oldPosts.some(Boolean) ? stored.map((_, index) => oldPosts[index] ?? 0) : []) ? photoPosts : undefined;
 if (!missing.length && !changedAlts && !thread && !placed) return true;
 const photo = changedAlts ? photosWithAlts(properties.photo ?? [], stored.map(photo => alts[photo.url] ?? photo.alt)) : undefined;
 const threaded = thread || placed ? threadUpdate(thread, placed) : { replace: {}, delete: [] };
 const message = missing.length ? `Record syndication links${changedAlts ? ' and photo alt text' : ''}${thread || placed ? ' and thread' : ''}` : 'Save syndication thread';
 await store.write(file.path, updateDocument(file.content, { ...(missing.length ? { add: { syndication: missing } } : {}), replace: { ...(photo ? { photo } : {}), ...threaded.replace }, ...(threaded.delete.length ? { delete: threaded.delete } : {}) }), { sha: file.sha, expectedHead: head, message });
 return true;
}

/** Photos on the site's media host are read from its bucket; Images shrinks them. */
export function photoSources(config: PublishingConfig): PhotoSources {
 return { mediaBucket: config.mediaBucket, mediaBaseUrl: config.mediaBaseUrl, images: config.images };
}

export async function deliverPublication(config: PublishingConfig, bucket: R2Bucket, job: OutboxJob, checkpoint: (progress: DeliveryProgress) => Promise<void>, dependencies: { publicFetch?: PublicFetcher; gitFetch?: typeof fetch; now?: () => number } = {}): Promise<'done' | 'superseded'> {
 const fetcher = dependencies.publicFetch ?? safePublicFetch;
 const gitFetch = dependencies.gitFetch ?? fetch;
 const now = dependencies.now ?? Date.now;
 const { event, progress } = job;
 let imported = false;
 let linked = new Set<Service>();
 const source = publicUrl(event.source);
 if (source.origin !== new URL(config.me).origin || !/^[a-f0-9]{64}$/.test(event.revision)) throw new DeliveryError('Invalid source identity', false);
 if (event.sourcePath) {
  const file = await createGitHubStore(config, gitFetch).read(event.sourcePath);
  if (!file) { if (event.action === 'publish') return 'superseded'; }
  else {
   const [folder,name] = splitPath(file.path); const post = parsePost(file.content, folder, name);
   imported = !!post.properties?.['pesos-source']?.length;
   // A renamed post that already links its social copies is not sent again.
   if (event.previousSources?.length) linked = new Set(services.filter(service => (post.syndication ?? []).some(link => { try { return new URL(link).origin === (service === 'bluesky' ? 'https://bsky.app' : new URL(config.syndication?.mastodon?.instance ?? 'https://social.coop').origin); } catch { return false; } })));
   if (event.action === 'publish' ? (!visible(post) || await publicationRevision(post) !== event.revision) : visible(post)) return 'superseded';
  }
 }
 const response = await fetcher(source.href, { cache: 'no-store', redirect: 'manual', headers: { Accept: 'text/html' } });
 if (event.action === 'remove') {
  if (![404,410].includes(response.status)) throw new DeliveryError('Removal is not public yet', true);
 } else if (response.status !== 200 || revisionFromHtml(await response.text()) !== event.revision) throw new DeliveryError('Intended revision is not public yet', true);
 let budget = 8;
 for (const target of event.targets) {
  if (progress.webmentions.includes(target) || progress.webmentionFailures?.[target]) continue;
  if (--budget < 0) throw new DeliveryError('Continue delivery next batch', true);
  await checkpoint(progress);
  try { await sendWebmention(event.source, target, fetcher); }
  catch (cause) {
   if (!(cause instanceof DeliveryError) || cause.retryable) throw cause;
   (progress.webmentionFailures ??= {})[target] = 'rejected_or_unsupported';
   await checkpoint(progress); continue;
  }
  progress.webmentions.push(target); await checkpoint(progress);
 }
 for (const service of event.action === 'publish' && !imported ? event.syndicateTo : []) {
  if (progress.syndication[service] || linked.has(service)) continue;
  if (!config.syndication?.[service]) throw new DeliveryError('Provider credentials are not configured', true);
  progress.syndicationStartedAt[service] ??= now(); await checkpoint(progress);
  progress.syndication[service] = await syndicationOnce(bucket, event, service, config.syndication ?? {}, fetcher, now, undefined, { sources: photoSources(config) });
  await checkpoint(progress);
 }
 await recordSyndicationResults(config, event, progress, gitFetch);
 return 'done';
}

export async function processPublishing(config?: PublishingConfig, dependencies: { publicFetch?: PublicFetcher; gitFetch?: typeof fetch; now?: () => number } = {}): Promise<{ processed: number; failed: number }> {
 if (!config?.deliveryEnabled || !config.state) return { processed: 0, failed: 0 };
 const fetcher = dependencies.publicFetch ?? safePublicFetch;
 try {
  const response = await fetcher(new URL('/publishing.json', config.me).href, { cache: 'no-store', redirect: 'manual' });
  if (!response.ok) throw new Error();
  const manifest = await response.json() as { version: number; publications: Publication[] };
  if (manifest.version !== 1 || !Array.isArray(manifest.publications) || manifest.publications.some(item => !item || new URL(item.url).origin !== new URL(config.me).origin || !/^[a-f0-9]{64}$/.test(item.revision) || !Array.isArray(item.targets) || !Array.isArray(item.syndicateTo))) throw new Error();
  await reconcilePublications(config.state, manifest.publications, dependencies.now?.());
 } catch { console.warn(JSON.stringify({ event: 'publishing_manifest_retry' })); }
 return processOutbox(config.state, (job, checkpoint) => deliverPublication(config, config.state!, job, checkpoint, dependencies), { now: dependencies.now, limit: 3, maxAttempts: 20 });
}

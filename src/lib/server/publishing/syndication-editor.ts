import type { Post } from '../../posts-types';
import { isPublicPost } from '../parse-post';
import type { AuthRPC, IndieAuthEnvironment, SessionInfo } from '../indieauth/contracts';
import { authSettings, authStore } from '../indieauth/contracts';
import { ProtocolError } from './auth';
import { sameOrigin } from '../form-origin';
import type { PublishingConfig } from './micropub';
import { publicationForPost } from './publication';
import { photoSources, readSyndicationReceipt, recordSyndicationResults, syndicationOnce } from './delivery';
import { preparePhotos, type PreparedPhoto, type SyndicationPhoto } from './syndication-photos';
import { DeliveryError } from './public-fetch';
import { PHOTO_LIMITS } from '../../social-text';
import { quoteNetwork } from './syndication-quotes';
import type { SocialSnapshot } from '../../social-snapshots';
import { maxThreadPosts, syndicationKey, syndicationText, syndicationThread } from './syndication';
import { safePublicFetch, type PublicFetcher } from './public-fetch';
import type { DeliveryEvent, DeliveryProgress } from './outbox';

export type Service = 'bluesky' | 'mastodon';
const services: Service[] = ['bluesky', 'mastodon'];
const names = { bluesky: 'Bluesky', mastodon: 'Mastodon' };
export interface Destination {
 service: Service; name: string; links: string[]; limit: number;
 /** The first post's text; `thread` holds every post. */
 draft: string;
 /** The posts to send, one or more. A retry shows the thread that was reviewed. */
 thread: string[];
 available: boolean; pending: boolean;
 /** A send recorded here whose link is not yet saved on the post. */
 unrecorded: boolean;
}

/** Use the same owner session as /account, without minting an access token. */
export async function editorSession(request: Request, env: IndieAuthEnvironment, rpc: AuthRPC | undefined = authStore(env)): Promise<SessionInfo | null> {
 const settings = authSettings(env);
 if (!settings || !rpc || new URL(request.url).origin !== new URL(settings.issuer).origin) return null;
 const token = request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith('__Host-indieauth-session='))?.slice('__Host-indieauth-session='.length);
 return token ? rpc.invoke('session', { token }) : null;
}
export async function validateEditorSubmission(request: Request, session: SessionInfo | null, csrf: unknown): Promise<void> {
 if (!session) throw new ProtocolError(401, 'invalid_token', 'Sign in to syndicate this post.');
 if (!sameOrigin(request) || typeof csrf !== 'string' || csrf.length > 4096) throw new ProtocolError(403, 'invalid_request', 'Reload the page and try again.');
 const hashes = await Promise.all([csrf, session.csrf].map(value => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
 const a = new Uint8Array(hashes[0]), b = new Uint8Array(hashes[1]);
 let difference = 0;
 for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
 if (difference) throw new ProtocolError(403, 'invalid_request', 'Reload the page and try again.');
}
export function assertSyndicatable(post: Post): void {
 if (post.draft || !isPublicPost(post)) throw new ProtocolError(409, 'invalid_request', 'Only published public posts can be syndicated.');
 // A repost with a comment goes out as a quote; plain likes and reposts stay on their original network.
 if (post.type === 'like' || (post.type === 'repost' && !post.content?.trim())) throw new ProtocolError(409, 'invalid_request', 'Like and repost actions use their original social workflow.');
}
export function recordedLinks(post: Post, service: Service, config: PublishingConfig): string[] {
 const origin = service === 'bluesky' ? 'https://bsky.app' : new URL(config.syndication?.mastodon?.instance ?? 'https://social.coop').origin;
 const links = new Map<string, string>();
 for (const value of Array.isArray(post.syndication) ? post.syndication : []) {
  try { const link = new URL(value); if (link.protocol !== 'https:' || link.origin !== origin || link.username || link.password) continue; }
  catch { continue; }
  // The first form of a link wins, so a saved handle URL hides the DID URL of the same post.
  if (!links.has(syndicationKey(value))) links.set(syndicationKey(value), value);
 }
 return [...links.values()];
}
export async function editorDestinations(config: PublishingConfig, post: Post): Promise<Destination[]> {
 assertSyndicatable(post);
 const publication = await publicationForPost(post, config.me);
 return Promise.all(services.map(async service => {
  const receipt = config.state ? await readSyndicationReceipt(config.state, publication.url, service, publication.previousUrls) : undefined;
  const saved = recordedLinks(post, service, config);
  const sent = receipt?.url ? recordedLinks({ ...post, syndication: [receipt.url] }, service, config) : [];
  // The receipt keeps the URL as sent; the post may store another form of it (Bluesky DID vs handle).
  const links = recordedLinks({ ...post, syndication: [...saved, ...sent] }, service, config);
  const limit = service === 'bluesky' ? 300 : 500;
  // A send in progress shows what it is sending; otherwise the post's stored thread, or one generated post.
  const thread = receipt?.thread?.length ? receipt.thread : receipt?.draft === undefined && publication.thread ? publication.thread : [receipt?.draft ?? syndicationText({ ...publication, idempotencyKey: 'preview' }, limit, service === 'bluesky' ? 3000 : Infinity, service)];
  return { service, name: names[service], links, unrecorded: links.length > saved.length, available: !!config.state && !!config.syndication?.[service],
   pending: receipt?.status === 'sending', limit, draft: thread[0], thread };
 }));
}

/** The whole post as plain text with its link, for splitting into a thread on the page. */
export async function threadSource(config: PublishingConfig, post: Post): Promise<{ text: string; link: string; stored: boolean }> {
 const publication = await publicationForPost(post, config.me);
 return { text: [publication.title, publication.text].filter(Boolean).join('\n\n').trim(), link: publication.url, stored: !!publication.thread };
}

/** Save a thread and its photo placement on the post without sending, so other clients see it. */
export async function saveEditorThread(config: PublishingConfig, post: Post, revision: string, draft: string[], submittedPhotos: unknown, gitFetch: typeof fetch = fetch): Promise<string> {
 assertSyndicatable(post);
 const publication = await publicationForPost(post, config.me);
 if (revision !== publication.revision) throw new ProtocolError(409, 'invalid_request', 'The original post changed. Reload to review the latest version.');
 const posts = threadOf(draft);
 if (!posts.length || posts.length > maxThreadPosts || posts.some(text => typeof text !== 'string' || !text.trim() || text.length > 10000)) throw new ProtocolError(422, 'invalid_request', `A thread has 1–${maxThreadPosts} posts, none of them empty.`);
 const photos = chosenPhotos(publication.photos ?? [], submittedPhotos);
 const event: DeliveryEvent = { source: publication.url, revision: publication.revision, action: 'publish', targets: [], syndicateTo: [], text: publication.text, published: publication.published, sourcePath: publication.sourcePath };
 const saved = await recordSyndicationResults(config, event, { webmentions: [], syndication: {}, syndicationStartedAt: {} }, gitFetch,
  { alts: Object.fromEntries(photos.map(photo => [photo.url, photo.alt])), thread: posts, photoPosts: Object.fromEntries(photos.map(photo => [photo.url, photo.post ?? 0])) });
 if (!saved) throw new ProtocolError(409, 'invalid_request', 'The original post changed. Reload to review the latest version.');
 return posts.length > 1 ? 'Thread saved to the post.' : 'Saved. The post has no thread now.';
}

/** The post a syndicated copy quotes natively, with the network that quotes it and its saved card. */
export async function quotedPost(config: PublishingConfig, post: Post): Promise<{ url: string; service: Service; snapshot?: SocialSnapshot } | undefined> {
 const quote = (await publicationForPost(post, config.me)).quote;
 const service = quote && quoteNetwork(quote.url);
 if (!quote || !service) return undefined;
 const snapshot = post.socialSnapshots?.find(saved => saved.url === quote.url);
 return { url: quote.url, service, ...(snapshot ? { snapshot } : {}) };
}

/** A submitted draft as its list of posts; a single string is a one-post thread. */
const threadOf = (draft: string | string[] | undefined): string[] => draft === undefined ? [] : Array.isArray(draft) ? draft : [draft];

/** A photo as the syndicate page shows it: the post's photo, its alt text, and the thread post it goes with. */
export interface ChosenPhoto extends SyndicationPhoto { post?: number }
/** The post's photos, with alt text, to show on the syndicate page. */
export async function postPhotos(config: PublishingConfig, post: Post): Promise<SyndicationPhoto[]> {
 return (await publicationForPost(post, config.me)).photos ?? [];
}
/**
 * The photos a submission chose, checked against the post: each one is the post's own,
 * once, with one line of alt text. Alt text may differ from the post's; it is saved back.
 */
export function chosenPhotos(post: SyndicationPhoto[], submitted: unknown): SyndicationPhoto[] {
 if (submitted === undefined) return post.slice(0, PHOTO_LIMITS.bluesky.count);
 const invalid = () => new ProtocolError(422, 'invalid_request', 'The photos changed since you opened this page. Reload to review the latest version.');
 if (!Array.isArray(submitted)) throw invalid();
 const urls = new Set(post.map(photo => photo.url));
 const seen = new Set<string>();
 return submitted.map(item => {
  const photo = item as Partial<ChosenPhoto> | null;
  if (!photo || typeof photo.url !== 'string' || typeof photo.alt !== 'string' || !urls.has(photo.url) || seen.has(photo.url) || (photo.post !== undefined && (!Number.isInteger(photo.post) || photo.post < 0 || photo.post >= maxThreadPosts))) throw invalid();
  seen.add(photo.url);
  return { url: photo.url, alt: photo.alt.replace(/\s+/g, ' ').trim(), ...(photo.post ? { post: photo.post } : {}) };
 });
}

/** Manual sends share automatic delivery's per-source receipts and GitHub writeback. */
export async function sendEditorDrafts(config: PublishingConfig, post: Post, revision: string, selected: unknown[], drafts: Partial<Record<Service, string | string[]>>, dependencies: { publicFetch?: PublicFetcher; gitFetch?: typeof fetch; now?: () => number; syncOnly?: boolean; photos?: unknown } = {}): Promise<string> {
 assertSyndicatable(post);
 if (!config.state) throw new ProtocolError(503, 'temporarily_unavailable', 'Syndication storage is unavailable.');
 const publication = await publicationForPost(post, config.me);
 if (revision !== publication.revision) throw new ProtocolError(409, 'invalid_request', 'The original post changed. Reload to review the latest version.');
 if ((!selected.length && !dependencies.syncOnly) || selected.some(service => !services.includes(service as Service))) throw new ProtocolError(422, 'invalid_request', 'Select Bluesky, Mastodon, or both.');
 const destinations = await editorDestinations(config, post);
 const chosen = dependencies.syncOnly ? [] : destinations.filter(destination => selected.includes(destination.service));
 const photos = dependencies.syncOnly ? [] : chosenPhotos(publication.photos ?? [], dependencies.photos);
 // Validate all destinations before sending any external request.
 for (const target of chosen) {
  if (target.links.length) continue;
  if (!target.available || target.pending) throw new ProtocolError(409, 'invalid_request', `${target.name} is unavailable or a previous send needs review.`);
  const posts = threadOf(drafts[target.service]);
  if (posts.length > maxThreadPosts) throw new ProtocolError(422, 'invalid_request', `A ${target.name} thread can have at most ${maxThreadPosts} posts.`);
  try {
   if (!posts.length || posts.some(draft => typeof draft !== 'string' || draft.length > 10000)) throw new Error();
   syndicationThread({ ...publication, idempotencyKey: 'validate', draft: posts[0], thread: posts }, target.service);
  } catch { throw new ProtocolError(422, 'invalid_request', posts.length > 1 ? `Each ${target.name} post must contain 1–${target.limit} characters.` : `The ${target.name} draft must contain 1–${target.limit} characters.`); }
 }
 // Read and fit every photo for every network before anything is sent.
 const prepared: Partial<Record<Service, PreparedPhoto[]>> = {};
 for (const target of chosen) {
  if (target.links.length || !photos.length) continue;
  try { prepared[target.service] = await preparePhotos(target.service, photos, photoSources(config)); }
  catch (cause) { throw new ProtocolError(422, 'invalid_request', cause instanceof DeliveryError ? `${cause.message}. Nothing was posted.` : `The photos could not be read for ${target.name}. Nothing was posted.`); }
 }
 const event: DeliveryEvent = { source: publication.url, revision: publication.revision, action: 'publish', targets: [], syndicateTo: [], text: publication.text, title: publication.title, published: publication.published, sourcePath: publication.sourcePath, ...(publication.previousUrls?.length ? { previousSources: publication.previousUrls } : {}), ...(publication.quote ? { quote: publication.quote } : {}) };
 const progress: DeliveryProgress = { webmentions: [], syndication: {}, syndicationStartedAt: {} };
 const messages: string[] = [];
 for (const target of chosen) {
  if (target.links.length) { messages.push(`${target.name} already syndicated.`); continue; }
  try {
   progress.syndication[target.service] = await syndicationOnce(config.state, event, target.service, config.syndication ?? {}, dependencies.publicFetch ?? safePublicFetch, dependencies.now ?? Date.now, threadOf(drafts[target.service]), { photos, prepared: prepared[target.service], sources: photoSources(config) });
   messages.push(`${target.name} sent.`);
  } catch { messages.push(`${target.name}: the send could not be confirmed. Check your social account before retrying.`); }
 }
 // Include prior successful sends so a failed GitHub write can be retried without posting again.
 for (const service of services) {
  const receipt = await readSyndicationReceipt(config.state, publication.url, service, publication.previousUrls);
  if (receipt?.status === 'sent' && receipt.url) progress.syndication[service] = receipt.url;
 }
 try {
  // The thread that went out (the first network's, when they differ) is kept on the post for every client.
  const sent = chosen.find(target => !target.links.length && progress.syndication[target.service]);
  const synced = await recordSyndicationResults(config, event, progress, dependencies.gitFetch ?? fetch, { alts: Object.fromEntries(photos.map(photo => [photo.url, photo.alt])),
   ...(sent ? { thread: threadOf(drafts[sent.service]), photoPosts: Object.fromEntries(photos.map(photo => [photo.url, photo.post ?? 0])) } : {}) });
  if (!synced) throw new Error('Original post changed');
  if (dependencies.syncOnly) messages.push('Syndication links synced to the original post.');
 } catch { messages.push('Social links are saved here, but the GitHub update failed. Use “Sync links to original post” to retry without sending again.'); }
 return messages.join(' ');
}

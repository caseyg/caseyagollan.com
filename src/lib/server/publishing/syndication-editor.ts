import type { Post } from '../../posts-types';
import { isPublicPost } from '../parse-post';
import type { AuthRPC, IndieAuthEnvironment, SessionInfo } from '../indieauth/contracts';
import { authSettings, authStore } from '../indieauth/contracts';
import { ProtocolError } from './auth';
import type { PublishingConfig } from './micropub';
import { publicationForPost } from './publication';
import { readSyndicationReceipt, recordSyndicationResults, syndicationOnce } from './delivery';
import { syndicationText } from './syndication';
import { safePublicFetch, type PublicFetcher } from './public-fetch';
import type { DeliveryEvent, DeliveryProgress } from './outbox';

export type Service = 'bluesky' | 'mastodon';
const services: Service[] = ['bluesky', 'mastodon'];
const names = { bluesky: 'Bluesky', mastodon: 'Mastodon' };
export interface Destination {
 service: Service; name: string; links: string[]; draft: string; limit: number;
 available: boolean; pending: boolean;
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
 if (request.headers.get('origin') !== new URL(request.url).origin || typeof csrf !== 'string' || csrf.length > 4096) throw new ProtocolError(403, 'invalid_request', 'Reload the page and try again.');
 const hashes = await Promise.all([csrf, session.csrf].map(value => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
 const a = new Uint8Array(hashes[0]), b = new Uint8Array(hashes[1]);
 let difference = 0;
 for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
 if (difference) throw new ProtocolError(403, 'invalid_request', 'Reload the page and try again.');
}
export function assertSyndicatable(post: Post): void {
 if (post.draft || !isPublicPost(post)) throw new ProtocolError(409, 'invalid_request', 'Only published public posts can be syndicated.');
 if (post.type === 'like' || post.type === 'repost') throw new ProtocolError(409, 'invalid_request', 'Like and repost actions use their original social workflow.');
}
export function recordedLinks(post: Post, service: Service, config: PublishingConfig): string[] {
 const origin = service === 'bluesky' ? 'https://bsky.app' : new URL(config.syndication?.mastodon?.instance ?? 'https://social.coop').origin;
 return [...new Set((Array.isArray(post.syndication) ? post.syndication : []).filter(value => {
  try { const link = new URL(value); return link.protocol === 'https:' && link.origin === origin && !link.username && !link.password; }
  catch { return false; }
 }))];
}
export async function editorDestinations(config: PublishingConfig, post: Post): Promise<Destination[]> {
 assertSyndicatable(post);
 const publication = await publicationForPost(post, config.me);
 return Promise.all(services.map(async service => {
  const receipt = config.state ? await readSyndicationReceipt(config.state, publication.url, service) : undefined;
  const links = recordedLinks(post, service, config);
  if (receipt?.url) links.push(...recordedLinks({ ...post, syndication: [receipt.url] }, service, config));
  const limit = service === 'bluesky' ? 300 : 500;
  return { service, name: names[service], links: [...new Set(links)], available: !!config.state && !!config.syndication?.[service],
   pending: receipt?.status === 'sending', limit,
   draft: receipt?.draft ?? syndicationText({ ...publication, idempotencyKey: 'preview' }, limit, service === 'bluesky' ? 3000 : Infinity) };
 }));
}

/** Manual sends share automatic delivery's per-source receipts and GitHub writeback. */
export async function sendEditorDrafts(config: PublishingConfig, post: Post, revision: string, selected: unknown[], drafts: Partial<Record<Service, string>>, dependencies: { publicFetch?: PublicFetcher; gitFetch?: typeof fetch; now?: () => number; syncOnly?: boolean } = {}): Promise<string> {
 assertSyndicatable(post);
 if (!config.state) throw new ProtocolError(503, 'temporarily_unavailable', 'Syndication storage is unavailable.');
 const publication = await publicationForPost(post, config.me);
 if (revision !== publication.revision) throw new ProtocolError(409, 'invalid_request', 'The original post changed. Reload to review the latest version.');
 if ((!selected.length && !dependencies.syncOnly) || selected.some(service => !services.includes(service as Service))) throw new ProtocolError(422, 'invalid_request', 'Select Bluesky, Mastodon, or both.');
 const destinations = await editorDestinations(config, post);
 const chosen = dependencies.syncOnly ? [] : destinations.filter(destination => selected.includes(destination.service));
 // Validate all destinations before sending any external request.
 for (const target of chosen) {
  if (target.links.length) continue;
  if (!target.available || target.pending) throw new ProtocolError(409, 'invalid_request', `${target.name} is unavailable or a previous send needs review.`);
  const draft = drafts[target.service];
  try {
   if (typeof draft !== 'string' || draft.length > 10000) throw new Error();
   syndicationText({ ...publication, idempotencyKey: 'validate', draft }, target.limit, target.service === 'bluesky' ? 3000 : Infinity, target.service);
  } catch { throw new ProtocolError(422, 'invalid_request', `The ${target.name} draft must contain 1–${target.limit} characters.`); }
 }
 const event: DeliveryEvent = { source: publication.url, revision: publication.revision, action: 'publish', targets: [], syndicateTo: [], text: publication.text, title: publication.title, published: publication.published, sourcePath: publication.sourcePath };
 const progress: DeliveryProgress = { webmentions: [], syndication: {}, syndicationStartedAt: {} };
 const messages: string[] = [];
 for (const target of chosen) {
  if (target.links.length) { messages.push(`${target.name} already syndicated.`); continue; }
  try {
   progress.syndication[target.service] = await syndicationOnce(config.state, event, target.service, config.syndication ?? {}, dependencies.publicFetch ?? safePublicFetch, dependencies.now ?? Date.now, drafts[target.service]);
   messages.push(`${target.name} sent.`);
  } catch { messages.push(`${target.name}: the send could not be confirmed. Check your social account before retrying.`); }
 }
 // Include prior successful sends so a failed GitHub write can be retried without posting again.
 for (const service of services) {
  const receipt = await readSyndicationReceipt(config.state, publication.url, service);
  if (receipt?.status === 'sent' && receipt.url) progress.syndication[service] = receipt.url;
 }
 try {
  const synced = await recordSyndicationResults(config, event, progress, dependencies.gitFetch ?? fetch);
  if (!synced) throw new Error('Original post changed');
  if (dependencies.syncOnly) messages.push('Syndication links synced to the original post.');
 } catch { messages.push('Social links are saved here, but the GitHub update failed. Use “Sync links to original post” to retry without sending again.'); }
 return messages.join(' ');
}

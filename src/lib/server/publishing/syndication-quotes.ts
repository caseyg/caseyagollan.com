import { DeliveryError, type PublicFetcher } from './public-fetch';
import { checkDeliveryResponse } from './webmention';

/** A post this post reposts with a comment, or quotes: sent as a native quote on its own network. */
export interface SyndicationQuote {
 url: string;
 /** The post's text without its "Reposted …" or "Quoting …" line, which the quote card replaces. */
 text: string;
}
const blueskyPost = /^\/profile\/([^/]+)\/post\/([a-z0-9]+)\/?$/i;
// Status paths of Mastodon and other fediverse servers that Mastodon's search can resolve.
const fediversePost = /^\/(?:@[^/]+\/(?:statuses\/)?[A-Za-z0-9]+|users\/[^/]+\/statuses\/[A-Za-z0-9]+|notice\/[A-Za-z0-9]+|notes\/[a-z0-9]+)\/?$/;

/** The network that can quote this post natively, if any. */
export function quoteNetwork(value: string): 'bluesky' | 'mastodon' | undefined {
 let url: URL;
 try { url = new URL(value); } catch { return undefined; }
 if (url.protocol !== 'https:' || url.username || url.password) return undefined;
 if (url.hostname === 'bsky.app') return blueskyPost.test(url.pathname) ? 'bluesky' : undefined;
 return fediversePost.test(url.pathname) ? 'mastodon' : undefined;
}

/** A quote that can't be made is left out; only errors worth retrying stop the send. */
async function lookup<T>(read: () => Promise<T | undefined>): Promise<T | undefined> {
 try { return await read(); }
 catch (cause) { if (cause instanceof DeliveryError && cause.retryable) throw cause; return undefined; }
}
async function json(response: Response): Promise<unknown> {
 checkDeliveryResponse(response);
 try { return await response.json(); } catch { throw new DeliveryError('Invalid provider response', true); }
}

/** The quoted Bluesky post's record reference, or nothing when it is gone or its author turned off quotes. */
export function blueskyQuoteRecord(base: string, accessJwt: string, value: string, fetcher: PublicFetcher, resolved: Map<string, string>): Promise<{ uri: string; cid: string } | undefined> {
 return lookup(async () => {
  const [, actor, rkey] = new URL(value).pathname.match(blueskyPost) ?? [];
  if (!actor) return undefined;
  let did = actor.startsWith('did:') ? actor : resolved.get(actor);
  if (!did) {
   const result = await json(await fetcher(base + '/xrpc/com.atproto.identity.resolveHandle?handle=' + encodeURIComponent(actor), { redirect: 'manual' })) as { did?: unknown };
   if (typeof result.did !== 'string' || !result.did.startsWith('did:')) return undefined;
   did = result.did; resolved.set(actor, did);
  }
  const uri = `at://${did}/app.bsky.feed.post/${rkey}`;
  const result = await json(await fetcher(base + '/xrpc/app.bsky.feed.getPosts?uris=' + encodeURIComponent(uri), { redirect: 'manual', headers: { authorization: `Bearer ${accessJwt}` } })) as { posts?: { uri?: unknown; cid?: unknown; viewer?: { embeddingDisabled?: unknown } }[] };
  const post = result.posts?.[0];
  if (!post || typeof post.uri !== 'string' || typeof post.cid !== 'string' || post.viewer?.embeddingDisabled === true) return undefined;
  return { uri: post.uri, cid: post.cid };
 });
}

/** The quoted status's id on our Mastodon server, or nothing when it can't be found or its author doesn't allow quotes. */
export function mastodonQuoteId(base: string, token: string, value: string, fetcher: PublicFetcher): Promise<string | undefined> {
 return lookup(async () => {
  const query = new URLSearchParams({ q: value, type: 'statuses', resolve: 'true', limit: '1' });
  const result = await json(await fetcher(`${base}/api/v2/search?${query}`, { redirect: 'manual', headers: { authorization: `Bearer ${token}` } })) as { statuses?: { id?: unknown; quote_approval?: { current_user?: unknown } }[] };
  const status = result.statuses?.[0];
  if (!status || typeof status.id !== 'string' || status.quote_approval?.current_user === 'denied') return undefined;
  return status.id;
 });
}

/**
 * Text for a post whose quote could not be attached: the quoted post's link is added
 * back when the text lacks it and it fits, so readers can still find what it quoted.
 */
export function withQuoteLink(text: string, url: string, fits: (text: string) => boolean): string {
 if (text.includes(url)) return text;
 const linked = `${text}\n\nRE: ${url}`;
 return fits(linked) ? linked : text;
}

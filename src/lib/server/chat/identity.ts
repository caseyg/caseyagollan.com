/**
 * Who is taking part in /chat. Casey is recognized by the site's own passkey session
 * (the IndieAuth server's `__Host-indieauth-session` cookie); visitors sign in with
 * their website (IndieAuth), Mastodon or Bluesky and get a chat-only session.
 *
 * Visitor sessions live in `PUBLISHING_STATE` under `chat/sessions/`, keyed by the
 * SHA-256 of the cookie value, so the bucket never holds a usable token. Imported by
 * worker.mjs as well as SvelteKit routes, so imports stay relative.
 */
import type { ChatAuthor, ChatViewer } from '../../chat';
import { authSettings, authStore, type IndieAuthEnvironment } from '../indieauth/contracts';
import { randomToken, sha256 } from '../publishing/dpop';

export interface ChatEnvironment extends IndieAuthEnvironment {
	PUBLISHING_STATE?: R2Bucket;
}

export const CHAT_COOKIE = '__Host-chat-session';
const OWNER_COOKIE = '__Host-indieauth-session';
const SESSION_TTL = 30 * 86400_000;
const sessionKey = async (token: string) => `chat/sessions/${await sha256(token)}.json`;

interface StoredSession { author: ChatAuthor; createdAt: number; expiresAt: number }

export function cookie(request: Request, name: string): string | undefined {
	const value = request.headers.get('cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
	return value && value.length <= 200 ? value : undefined;
}

/** Whether this request carries Casey's own passkey session. */
export async function isOwnerRequest(request: Request, env: ChatEnvironment): Promise<boolean> {
	const settings = authSettings(env);
	const store = authStore(env);
	if (!settings || !store) return false;
	if (new URL(request.url).origin !== new URL(settings.issuer).origin) return false;
	const token = cookie(request, OWNER_COOKIE);
	if (!token) return false;
	try { return !!(await store.invoke('session', { token })); } catch { return false; }
}

export function ownerAuthor(env: ChatEnvironment): ChatAuthor {
	const me = env.AUTH_ME ?? 'https://caseyagollan.com/';
	return { id: `web:${me}`, name: 'Casey Gollan', url: me, photo: '/author-avatar.webp', via: 'owner' };
}

/** The signed-in viewer, or null for a reader. The owner wins when both sessions are present. */
export async function chatViewer(request: Request, env: ChatEnvironment): Promise<ChatViewer | null> {
	if (await isOwnerRequest(request, env)) return { ...ownerAuthor(env), owner: true };
	const token = cookie(request, CHAT_COOKIE);
	if (!token || !env.PUBLISHING_STATE) return null;
	const object = await env.PUBLISHING_STATE.get(await sessionKey(token));
	if (!object) return null;
	const session = await object.json<StoredSession>().catch(() => null);
	if (!session || session.expiresAt < Date.now()) return null;
	// A visitor whose profile is Casey's own site still isn't the owner: only the passkey session is.
	return { ...session.author, owner: false };
}

/** Start a visitor session; returns the `Set-Cookie` value. */
export async function startVisitorSession(env: ChatEnvironment, author: ChatAuthor, now = Date.now()): Promise<string> {
	if (!env.PUBLISHING_STATE) throw new Error('Chat sign-in is not configured');
	const token = randomToken(32);
	const session: StoredSession = { author, createdAt: now, expiresAt: now + SESSION_TTL };
	await env.PUBLISHING_STATE.put(await sessionKey(token), JSON.stringify(session), { httpMetadata: { contentType: 'application/json' } });
	return `${CHAT_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL / 1000}`;
}

/** End the visitor session; returns the `Set-Cookie` value that clears it. */
export async function endVisitorSession(request: Request, env: ChatEnvironment): Promise<string> {
	const token = cookie(request, CHAT_COOKIE);
	if (token && env.PUBLISHING_STATE) await env.PUBLISHING_STATE.delete(await sessionKey(token));
	return `${CHAT_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/** The viewer, passed from the Worker to the thread agent in a header the browser cannot set. */
export const VIEWER_HEADER = 'x-chat-viewer';

export function withViewer(request: Request, viewer: ChatViewer | null): Request {
	const headers = new Headers(request.headers);
	headers.delete(VIEWER_HEADER);
	if (viewer) headers.set(VIEWER_HEADER, encodeURIComponent(JSON.stringify(viewer)));
	// A fresh request rather than `new Request(request, …)`, which some runtimes let keep the old headers.
	return new Request(request.url, { method: request.method, headers, body: ['GET', 'HEAD'].includes(request.method) ? null : request.body, redirect: request.redirect });
}

export function viewerFrom(request: Request): ChatViewer | null {
	const value = request.headers.get(VIEWER_HEADER);
	if (!value) return null;
	try {
		const viewer = JSON.parse(decodeURIComponent(value)) as ChatViewer;
		return typeof viewer?.id === 'string' && typeof viewer.name === 'string' ? viewer : null;
	} catch { return null; }
}

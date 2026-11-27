/**
 * Passes: how a table Casey reached through the Claude connector opens on the site without the
 * passkey, which Claude's built-in browser can't use. The connector, already approved by Casey,
 * hands out a link to one table (`/tables/<id>?pass=…`, good for half an hour). The browser that
 * opens it swaps the link for a cookie that lets it see that one table for a week, and change it
 * if the connection itself may (`update`). A pass never reaches anything else: not other tables,
 * not publishing, not the chat, not the owner's private sources.
 *
 * Only a hash of each pass is kept, under `private/tables/passes/` in `PUBLISHING_STATE`.
 */
export const PASS_PARAM = 'pass';
export const PASS_COOKIE = '__Host-table-pass';
/** How long a link works, and how long the browser that opened it keeps its pass. */
export const LINK_TTL = 30 * 60_000;
export const KEPT_TTL = 7 * 24 * 60 * 60_000;
/** A browser keeps passes to this many tables; opening another lets the oldest go. */
const KEPT_MAX = 6;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export interface TablePass {
	table: string;
	/** Whether the holder may change the table, not only see it. */
	edit: boolean;
	expires: number;
	kind: 'link' | 'kept';
}

type Bucket = Pick<R2Bucket, 'get' | 'put' | 'delete'>;

async function digest(value: string): Promise<string> {
	const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
const keyOf = async (token: string) => `private/tables/passes/${await digest(token)}.json`;

function newToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function issue(bucket: Bucket, pass: TablePass): Promise<string> {
	const token = newToken();
	await bucket.put(await keyOf(token), JSON.stringify(pass), { httpMetadata: { contentType: 'application/json' } });
	return token;
}

/** A pass by its token, while it lasts. */
export async function readPass(bucket: Bucket | undefined, token: string | null | undefined, now = Date.now()): Promise<TablePass | null> {
	if (!bucket || !token || !TOKEN.test(token)) return null;
	const object = await bucket.get(await keyOf(token)).catch(() => null);
	const pass = object ? ((await object.json().catch(() => null)) as TablePass | null) : null;
	if (!pass || typeof pass.table !== 'string' || typeof pass.expires !== 'number') return null;
	if (pass.expires <= now) {
		await bucket.delete(await keyOf(token)).catch(() => {});
		return null;
	}
	return pass;
}

/** The address that opens a table without signing in, for whoever the connector gives it to. */
export async function passLink(bucket: Bucket, origin: string, table: string, edit: boolean, now = Date.now()): Promise<string> {
	return `${origin}/tables/${table}?${PASS_PARAM}=${await issue(bucket, { table, edit, expires: now + LINK_TTL, kind: 'link' })}`;
}

const cookieTokens = (request: Request) =>
	(request.headers.get('cookie') ?? '').split(/;\s*/).find((part) => part.startsWith(`${PASS_COOKIE}=`))?.slice(PASS_COOKIE.length + 1).split('.').filter((token) => TOKEN.test(token)).slice(0, KEPT_MAX) ?? [];

/**
 * Swaps a link's pass for one this browser keeps. Returns the value for its `PASS_COOKIE` (see
 * `PASS_COOKIE_OPTIONS`), or null for a link that is spent, for another table, or made up.
 */
export async function keepPass(bucket: Bucket | undefined, request: Request, table: string, token: string | null, now = Date.now()): Promise<string | null> {
	const link = await readPass(bucket, token, now);
	if (!bucket || !link || link.kind !== 'link' || link.table !== table) return null;
	const kept = await issue(bucket, { table, edit: link.edit, expires: now + KEPT_TTL, kind: 'kept' });
	return [kept, ...cookieTokens(request)].slice(0, KEPT_MAX).join('.');
}

export const PASS_COOKIE_OPTIONS = { path: '/', maxAge: KEPT_TTL / 1000, httpOnly: true, secure: true, sameSite: 'lax' } as const;

/** What goes in `x-csrf-token` with a change made on a pass: only a page given the pass's own data has it. */
export const passCsrf = (token: string) => digest(`table-pass-csrf:${token}`);

/** The pass this browser keeps for a table, if it has one: whether it may change it, and its CSRF token. */
export async function passFor(request: Request, bucket: Bucket | undefined, table: string, now = Date.now()): Promise<{ edit: boolean; csrf: string } | null> {
	for (const token of cookieTokens(request)) {
		const pass = await readPass(bucket, token, now);
		if (pass?.kind === 'kept' && pass.table === table) return { edit: pass.edit, csrf: await passCsrf(token) };
	}
	return null;
}

/** Whether a request that changes a table comes from a page holding an editing pass to it. */
export async function passMayEdit(request: Request, bucket: Bucket | undefined, table: string, now = Date.now()): Promise<boolean> {
	const pass = await passFor(request, bucket, table, now);
	const origin = request.headers.get('origin');
	return !!pass?.edit && request.headers.get('x-csrf-token') === pass.csrf && (!origin || origin === new URL(request.url).origin);
}

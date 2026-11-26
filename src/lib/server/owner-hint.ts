import { OWNER_HINT_COOKIE } from '$lib/owner';

const SESSION_COOKIE = '__Host-indieauth-session';
/** How long a hint for a session that was already open lasts; a stale one costs one session check. */
const BACKFILL_MAX_AGE = 30 * 24 * 60 * 60;

const hint = (maxAge: number) => `${OWNER_HINT_COOKIE}=1; Path=/; Secure; SameSite=Lax; Max-Age=${maxAge}`;

function readCookie(request: Request, name: string) {
	return request.headers.get('cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

/**
 * Keep a readable `owner-hint` cookie beside the owner's HttpOnly session cookie, so static pages
 * know to ask whether Casey is signed in (and load the chat and owner links) on every browser
 * Casey signs in on. The localStorage hint alone was set only by some sign-in pages, and Safari
 * clears script-set storage after a week away, so a signed-in browser could show no chat at all.
 *
 * The hint grants nothing: the session cookie still gates every owner action.
 */
export function withOwnerHint(request: Request, response: Response): Response {
	const cookies = response.headers.getSetCookie?.() ?? [];
	const setting = cookies.find((value) => value.startsWith(`${SESSION_COOKIE}=`));
	let value: string | null = null;
	if (setting) {
		// Signing in sets the session; signing out clears it. The hint follows it either way.
		const maxAge = Number(setting.match(/Max-Age=(\d+)/i)?.[1] ?? BACKFILL_MAX_AGE);
		const cleared = setting.startsWith(`${SESSION_COOKIE}=;`) || maxAge === 0;
		value = hint(cleared ? 0 : maxAge);
	} else if (readCookie(request, SESSION_COOKIE) && readCookie(request, OWNER_HINT_COOKIE) !== '1') {
		// A session from before the hint existed.
		value = hint(BACKFILL_MAX_AGE);
	}
	if (!value) return response;
	try {
		response.headers.append('set-cookie', value);
		return response;
	} catch {
		// Some responses (a fetched one passed through) have immutable headers.
		const copy = new Response(response.body, response);
		copy.headers.append('set-cookie', value);
		return copy;
	}
}

/**
 * A browser-local hint that the owner has signed in here. It only decides whether
 * to ask the server about the session; the session cookie still gates every action.
 */
const KEY = 'owner-signed-in';
/** Set by the server beside the session cookie (see src/lib/server/owner-hint.ts), readable here. */
export const OWNER_HINT_COOKIE = 'owner-hint';

let check: Promise<boolean> | undefined;

export function rememberOwner(signedIn: boolean): void {
	check = undefined;
	try {
		if (signedIn) localStorage.setItem(KEY, '1');
		else localStorage.removeItem(KEY);
	} catch { /* Storage can be unavailable; the edit page still offers sign-in. */ }
	if (!signedIn && typeof document !== 'undefined') document.cookie = `${OWNER_HINT_COOKIE}=; Path=/; Secure; SameSite=Lax; Max-Age=0`;
}

function hintCookie(): boolean {
	try {
		return typeof document !== 'undefined' && document.cookie.split(';').some((part) => part.trim() === `${OWNER_HINT_COOKIE}=1`);
	} catch { return false; }
}

export function ownerHint(): boolean {
	// Either hint will do: the server sets the cookie at sign-in, some pages set the stored one.
	try { if (localStorage.getItem(KEY) === '1') return true; } catch { /* fall through to the cookie */ }
	return hintCookie();
}

/**
 * Whether the owner is signed in right now, for showing owner links on static pages.
 * Visitors without the hint never call the server. With it, one session check per
 * page load decides, and a session that has ended clears the hint.
 */
export function ownerSignedIn(): Promise<boolean> {
	if (!ownerHint()) return Promise.resolve(false);
	check ??= fetch('/auth/session', { credentials: 'same-origin', cache: 'no-store' })
		.then(async (response) => {
			if (!response.ok) return false;
			const { authenticated } = (await response.json()) as { authenticated?: boolean };
			if (!authenticated) rememberOwner(false);
			return !!authenticated;
		})
		.catch(() => false);
	return check;
}

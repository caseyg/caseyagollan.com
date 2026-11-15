/**
 * A browser-local hint that the owner has signed in here. It only decides whether
 * to ask the server about the session; the session cookie still gates every action.
 */
const KEY = 'owner-signed-in';

let check: Promise<boolean> | undefined;

export function rememberOwner(signedIn: boolean): void {
	check = undefined;
	try {
		if (signedIn) localStorage.setItem(KEY, '1');
		else localStorage.removeItem(KEY);
	} catch { /* Storage can be unavailable; the edit page still offers sign-in. */ }
}

export function ownerHint(): boolean {
	try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
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

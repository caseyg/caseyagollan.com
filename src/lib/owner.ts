/**
 * A browser-local hint that the owner has signed in here. It only decides whether
 * to show owner links on static pages; the session cookie still gates every action.
 */
const KEY = 'owner-signed-in';

export function rememberOwner(signedIn: boolean): void {
	try {
		if (signedIn) localStorage.setItem(KEY, '1');
		else localStorage.removeItem(KEY);
	} catch { /* Storage can be unavailable; the edit page still offers sign-in. */ }
}

export function ownerHint(): boolean {
	try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

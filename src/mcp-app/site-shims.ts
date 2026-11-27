/**
 * The table view runs in its host's sandbox, at an address that isn't the site's, so everything
 * the site's own components address from the root (`/2024/…/source.json`, a post's picture, a
 * block's link) would go nowhere. This points those at the site, before anything draws.
 */
declare global {
	interface Window { __SITE_ORIGIN__?: string }
}

const origin = (window.__SITE_ORIGIN__ ?? '').replace(/\/$/, '');
export const SITE_ORIGIN = origin;

/** A root-relative address made the site's; anything else as it was. */
export const onSite = (address: string) => (origin && /^\/(?!\/)/.test(address) ? origin + address : address);

/** Whoever opens links for the view (its host); set once the view is connected. */
let opener: ((url: string) => void) | undefined;
export const openWith = (open: (url: string) => void) => (opener = open);

if (origin) {
	const plain = window.fetch.bind(window);
	// Never the site's cookies: the view isn't signed in, and only reads what anyone can.
	window.fetch = Object.assign((input: RequestInfo | URL, init?: RequestInit) => (typeof input === 'string' && /^\/(?!\/)/.test(input) ? plain(origin + input, { ...init, credentials: 'omit' }) : plain(input, init)), plain) as typeof fetch;

	const attribute = Element.prototype.setAttribute;
	Element.prototype.setAttribute = function (name, value) {
		return attribute.call(this, name, (name === 'src' || name === 'href' || name === 'poster') && typeof value === 'string' ? onSite(value) : value);
	};
	const properties: [{ prototype: object }, string][] = [[HTMLImageElement, 'src'], [HTMLMediaElement, 'src'], [HTMLVideoElement, 'poster'], [HTMLSourceElement, 'src'], [HTMLAnchorElement, 'href']];
	for (const [type, name] of properties) {
		const described = Object.getOwnPropertyDescriptor(type.prototype, name);
		if (!described?.set) continue;
		const set = described.set;
		Object.defineProperty(type.prototype, name, { ...described, set(value: unknown) { set.call(this, typeof value === 'string' ? onSite(value) : value); } });
	}
}

// A sandboxed view can't open a window itself: links and opened blocks go through the host.
window.open = (url) => {
	if (url) opener?.(onSite(String(url)));
	return null;
};
document.addEventListener('click', (event) => {
	const link = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
	if (!link || event.defaultPrevented || !/^https?:/.test(link.href)) return;
	event.preventDefault();
	opener?.(link.href);
});

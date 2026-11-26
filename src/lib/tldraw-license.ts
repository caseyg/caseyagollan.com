/**
 * tldraw's SDK license for this site: a hobby licence with the "made with tldraw" watermark, valid
 * for caseyagollan.com and its subdomains until 2027-11-15. tldraw's keys are meant to be public.
 * Elsewhere, outside localhost, tldraw shows the canvas for five seconds and then hides it.
 */
export const TLDRAW_LICENSE_KEY =
	'tldraw-casey-gollan-2027-11-15/WyJIYVQ3Tm5jNSIsWyIqLmNhc2V5YWdvbGxhbi5jb20iXSw3MywiMjAyNy0xMS0xNSJd.xXKIiMfwZRK7X7Zo4Z1RbXJUntEGTGgViPMdk4Q7n2sjOKR1Wfb276H1sRDsg+u5Xm8HqnmNODqVdzGjoT3HFw';

/**
 * A second key for hosts the site's licence doesn't cover (workers.dev branch previews, the branch
 * Storybook). It is not in the repository: preview builds get it from the Workers Builds variable
 * `PUBLIC_TLDRAW_PREVIEW_LICENSE_KEY`, set on Previews only, so production builds have none.
 */
export const TLDRAW_PREVIEW_LICENSE_KEY: string = typeof __TLDRAW_PREVIEW_LICENSE_KEY__ === 'string' ? __TLDRAW_PREVIEW_LICENSE_KEY__ : '';

/** Hosts the site's licence covers, plus loopback hosts, where tldraw needs none. */
function siteHost(hostname: string): boolean {
	const host = hostname.toLowerCase();
	return host === 'caseyagollan.com' || host.endsWith('.caseyagollan.com') || host === 'localhost' || host.endsWith('.localhost') || host === '::1' || host === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(host);
}

/** A key's expiry is the date that ends its name, before the slash; tldraw allows evaluation keys no grace after it. */
function expired(key: string, now: Date): boolean {
	const date = /(\d{4}-\d{2}-\d{2})\//.exec(key)?.[1];
	return !!date && now.getTime() > Date.parse(`${date}T23:59:59Z`);
}

/** The key to hand tldraw on this host: the site's own wherever it applies, the preview key elsewhere. */
export function tldrawLicenseKey(hostname: string, previewKey = TLDRAW_PREVIEW_LICENSE_KEY): string {
	return siteHost(hostname) || !previewKey ? TLDRAW_LICENSE_KEY : previewKey;
}

/** Whether the canvas stays up on this host. */
export function tldrawLicensed(hostname: string, previewKey = TLDRAW_PREVIEW_LICENSE_KEY, now = new Date()): boolean {
	return siteHost(hostname) || (!!previewKey && !expired(previewKey, now));
}

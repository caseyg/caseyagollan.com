/**
 * tldraw's SDK license for this site: a hobby licence with the "made with tldraw" watermark, valid
 * for caseyagollan.com and its subdomains until 2027-11-15. tldraw's keys are meant to be public.
 * Elsewhere, outside localhost, tldraw shows the canvas for five seconds and then hides it.
 */
export const TLDRAW_LICENSE_KEY =
	'tldraw-casey-gollan-2027-11-15/WyJIYVQ3Tm5jNSIsWyIqLmNhc2V5YWdvbGxhbi5jb20iXSw3MywiMjAyNy0xMS0xNSJd.xXKIiMfwZRK7X7Zo4Z1RbXJUntEGTGgViPMdk4Q7n2sjOKR1Wfb276H1sRDsg+u5Xm8HqnmNODqVdzGjoT3HFw';

/** Hosts the licence covers, plus loopback hosts, where tldraw needs none. */
export function tldrawLicensed(hostname: string): boolean {
	const host = hostname.toLowerCase();
	return host === 'caseyagollan.com' || host.endsWith('.caseyagollan.com') || host === 'localhost' || host.endsWith('.localhost') || host === '::1' || host === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(host);
}

/**
 * Email signups for the newsletter on Buttondown. The Worker secret `BUTTONDOWN_API_KEY` stays on
 * the server: readers' browsers post to `/api/subscribe`, never to Buttondown with the key.
 * https://docs.buttondown.com/api-subscribers-create
 */

const ENDPOINT = 'https://api.buttondown.com/v1/subscribers';

export type SubscribeResult =
	| { ok: true; status: 'subscribed' | 'already' }
	| { ok: false; status: 'invalid' | 'unavailable' | 'failed'; message: string };

/** A loose check; Buttondown does the real one. */
export const looksLikeEmail = (value: string) => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export async function subscribe(apiKey: string | undefined, email: string, details: { ip?: string | null } = {}, fetcher: typeof fetch = fetch): Promise<SubscribeResult> {
	if (!looksLikeEmail(email)) return { ok: false, status: 'invalid', message: 'That doesn’t look like an email address.' };
	if (!apiKey) return { ok: false, status: 'unavailable', message: 'Email signup isn’t set up here yet. The feeds below work.' };

	// `unactivated` makes Buttondown send a confirmation email (double opt-in). Subscribers
	// created through the API are otherwise `regular` straight away.
	const body: Record<string, unknown> = { email_address: email, type: 'unactivated' };
	// Buttondown checks the reader's address for spam signups.
	if (details.ip) body.ip_address = details.ip;

	let response: Response;
	try {
		response = await fetcher(ENDPOINT, {
			method: 'POST',
			headers: { Authorization: `Token ${apiKey}`, 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
	} catch {
		return { ok: false, status: 'failed', message: 'Buttondown couldn’t be reached. Try again in a moment.' };
	}
	if (response.ok) return { ok: true, status: 'subscribed' };

	const error = (await response.json().catch(() => null)) as { code?: string; detail?: string } | null;
	const said = `${error?.code ?? ''} ${error?.detail ?? ''}`;
	if (response.status === 400 && /suppressed|unsubscribed|blocked/i.test(said)) return { ok: false, status: 'failed', message: 'That address can’t be signed up again from here.' };
	if (response.status === 400 && /exist|already|collision/i.test(said)) return { ok: true, status: 'already' };
	if (response.status === 400 && /email|invalid/i.test(said)) return { ok: false, status: 'invalid', message: 'Buttondown didn’t accept that address.' };
	if (response.status === 429) return { ok: false, status: 'failed', message: 'Too many signups right now. Try again later.' };
	return { ok: false, status: 'failed', message: 'That didn’t go through. Try again in a moment.' };
}

const API = 'https://api.buttondown.com/v1';

/** What the owner sees about the newsletter. Never the whole object: Buttondown's includes the API key. */
export interface NewsletterSummary {
	username: string;
	name: string;
	url: string;
	/** Which of the site's settings Buttondown already has. */
	applied: Record<string, boolean>;
	/** Settings Buttondown refused on the last apply, with its reason, such as a plan limit. */
	refused?: Record<string, string>;
}

async function call(apiKey: string, path: string, init: RequestInit = {}, fetcher: typeof fetch = fetch): Promise<Record<string, unknown>> {
	const response = await fetcher(`${API}${path}`, { ...init, headers: { Authorization: `Token ${apiKey}`, 'Content-Type': 'application/json', ...init.headers } });
	if (!response.ok) throw new Error(`Buttondown answered ${response.status}`);
	return (await response.json()) as Record<string, unknown>;
}

const same = (a: unknown, b: unknown) => (typeof b === 'object' && b !== null ? JSON.stringify(a) === JSON.stringify(b) : a === b);

function summarize(newsletter: Record<string, unknown>, theme: Record<string, unknown>): NewsletterSummary {
	const username = String(newsletter.username ?? '');
	const domain = typeof newsletter.domain === 'string' && newsletter.domain ? newsletter.domain : '';
	return {
		username,
		name: String(newsletter.name ?? username),
		url: domain ? `https://${domain}` : `https://buttondown.com/${username}`,
		applied: Object.fromEntries(Object.entries(theme).map(([key, value]) => [key, same(newsletter[key], value)]))
	};
}

async function firstNewsletter(apiKey: string, fetcher: typeof fetch) {
	const page = await call(apiKey, '/newsletters', {}, fetcher);
	const newsletter = (page.results as Record<string, unknown>[] | undefined)?.[0];
	if (!newsletter?.id) throw new Error('No newsletter on this Buttondown account');
	return newsletter;
}

export async function readNewsletter(apiKey: string, theme: Record<string, unknown>, fetcher: typeof fetch = fetch): Promise<NewsletterSummary> {
	return summarize(await firstNewsletter(apiKey, fetcher), theme);
}

/**
 * Sends the site's look to Buttondown one setting at a time, so a setting the plan doesn't allow
 * (custom CSS) doesn't stop the others, and returns the newsletter as it now stands.
 */
export async function applyNewsletterTheme(apiKey: string, theme: Record<string, unknown>, fetcher: typeof fetch = fetch): Promise<NewsletterSummary> {
	let newsletter = await firstNewsletter(apiKey, fetcher);
	const path = `${API}/newsletters/${encodeURIComponent(String(newsletter.id))}`;
	const refused: Record<string, string> = {};
	for (const [key, value] of Object.entries(theme)) {
		if (same(newsletter[key], value)) continue;
		const response = await fetcher(path, { method: 'PATCH', headers: { Authorization: `Token ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ [key]: value }) });
		if (response.ok) newsletter = (await response.json()) as Record<string, unknown>;
		else {
			const error = (await response.json().catch(() => null)) as { detail?: unknown } | null;
			// Buttondown's own reason, kept short; it never contains the key.
			refused[key] = typeof error?.detail === 'string' ? error.detail.slice(0, 200) : `Buttondown answered ${response.status}.`;
		}
	}
	return { ...summarize(newsletter, theme), ...(Object.keys(refused).length ? { refused } : {}) };
}

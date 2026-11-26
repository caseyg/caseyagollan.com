/** Screenshots of cited pages, captured with Browser Rendering and kept in R2 without expiry. */
export interface ScreenshotEnvironment {
	SCREENSHOTS?: R2Bucket;
	CLOUDFLARE_ACCOUNT_ID?: string;
	CLOUDFLARE_API_TOKEN?: string;
}

function hashUrl(url: string): string {
	let hash = 0;
	for (let i = 0; i < url.length; i++) {
		hash = ((hash << 5) - hash) + url.charCodeAt(i);
		hash = hash & hash;
	}
	return Math.abs(hash).toString(36);
}

export const screenshotKey = (normalizedUrl: string) => `screenshots/${hashUrl(normalizedUrl)}.png`;

export async function cachedScreenshot(env: ScreenshotEnvironment, normalizedUrl: string): Promise<ArrayBuffer | null> {
	if (!env.SCREENSHOTS) return null;
	try {
		const cached = await env.SCREENSHOTS.get(screenshotKey(normalizedUrl));
		return cached ? await cached.arrayBuffer() : null;
	} catch (e) {
		console.error('R2 read error:', e);
		return null;
	}
}

export class ScreenshotError extends Error {}

/** Captures a fresh screenshot and stores it; throws `ScreenshotError` when it can't. */
export async function captureScreenshot(env: ScreenshotEnvironment, normalizedUrl: string): Promise<ArrayBuffer> {
	const accountId = env.CLOUDFLARE_ACCOUNT_ID;
	const apiToken = env.CLOUDFLARE_API_TOKEN;
	if (!accountId || !apiToken) throw new ScreenshotError('Browser Rendering API not configured');
	const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/screenshot`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({
			url: normalizedUrl,
			viewport: { width: 1280, height: 800 },
			screenshotOptions: { type: 'png', clip: { x: 0, y: 0, width: 1280, height: 800 } },
			gotoOptions: { waitUntil: 'networkidle0', timeout: 15000 }
		})
	});
	if (!response.ok) {
		console.error('Browser Rendering API error:', response.status, await response.text());
		throw new ScreenshotError('Failed to capture screenshot');
	}
	const imageData = await response.arrayBuffer();
	if (env.SCREENSHOTS) {
		try {
			await env.SCREENSHOTS.put(screenshotKey(normalizedUrl), imageData, {
				httpMetadata: { contentType: 'image/png' },
				customMetadata: { url: normalizedUrl, capturedAt: new Date().toISOString() }
			});
		} catch (e) {
			console.error('R2 write error:', e);
		}
	}
	return imageData;
}

/** Makes sure a screenshot is cached, capturing one if needed. Never throws. */
export async function warmScreenshot(env: ScreenshotEnvironment, url: string): Promise<boolean> {
	try {
		const normalizedUrl = new URL(url).toString();
		if (await cachedScreenshot(env, normalizedUrl)) return true;
		await captureScreenshot(env, normalizedUrl);
		return true;
	} catch {
		return false;
	}
}

// ---------------------------------------------------------------- whole pages

/** The widest a page is drawn, in CSS pixels: a desktop layout. */
export const FULL_WIDTH = 1280;
/** How long a whole-page capture may take to load, in milliseconds (Browser Rendering's most is 60,000). */
const FULL_TIMEOUT = 30_000;

export interface FullScreenshot { key: string; width: number; height: number; bytes: number; cached: boolean }

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
/** A short, stable name for an address: the start of its SHA-256. */
export async function addressHash(address: string): Promise<string> {
	return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(address))).slice(0, 32);
}

export const fullScreenshotKey = async (normalizedUrl: string) => `screenshots/full/${await addressHash(normalizedUrl)}.jpg`;

/** A JPEG's width and height, from its frame header; null for anything else. */
export function jpegSize(data: ArrayBuffer | Uint8Array): { width: number; height: number } | null {
	const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
	if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
	let at = 2;
	while (at + 9 < bytes.length) {
		if (bytes[at] !== 0xff) return null;
		const marker = bytes[at + 1];
		if (marker === 0xff) { at++; continue; }
		// Start-of-frame markers carry the size; C4, C8 and CC are tables, not frames.
		if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { height: (bytes[at + 5] << 8) | bytes[at + 6], width: (bytes[at + 7] << 8) | bytes[at + 8] };
		if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { at += 2; continue; }
		at += 2 + ((bytes[at + 2] << 8) | bytes[at + 3]);
	}
	return null;
}

/** A whole-page screenshot already kept, with its size, or null. */
export async function cachedFullScreenshot(env: ScreenshotEnvironment, normalizedUrl: string): Promise<FullScreenshot | null> {
	if (!env.SCREENSHOTS) return null;
	const key = await fullScreenshotKey(normalizedUrl);
	const found = await env.SCREENSHOTS.head(key).catch(() => null);
	const width = Number(found?.customMetadata?.width), height = Number(found?.customMetadata?.height);
	return found && width > 0 && height > 0 ? { key, width, height, bytes: found.size, cached: true } : null;
}

/**
 * A screenshot of a whole page, top to bottom, as a JPEG kept in R2: the one already there, or a
 * fresh capture (`refresh` always captures). The page is given until its network goes quiet; one
 * that never does (a feed that keeps loading) is taken as it stands once it has loaded.
 * Throws `ScreenshotError` when it can't. The caller checks the address is a public one.
 */
export async function fullScreenshot(env: ScreenshotEnvironment, normalizedUrl: string, options: { refresh?: boolean; fetcher?: typeof fetch } = {}): Promise<FullScreenshot> {
	if (!env.SCREENSHOTS) throw new ScreenshotError('There is nowhere to keep screenshots here.');
	if (!options.refresh) { const kept = await cachedFullScreenshot(env, normalizedUrl); if (kept) return kept; }
	const accountId = env.CLOUDFLARE_ACCOUNT_ID, apiToken = env.CLOUDFLARE_API_TOKEN;
	if (!accountId || !apiToken) throw new ScreenshotError('Screenshots aren’t set up here: this deployment has no Browser Rendering token (CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN).');
	const capture = (waitUntil: string) => (options.fetcher ?? fetch)(`https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/screenshot`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({
			url: normalizedUrl,
			viewport: { width: FULL_WIDTH, height: 800 },
			screenshotOptions: { type: 'jpeg', quality: 80, fullPage: true },
			gotoOptions: { waitUntil, timeout: FULL_TIMEOUT }
		})
	});
	let response = await capture('networkidle2');
	if (!response.ok) {
		console.warn(JSON.stringify({ event: 'full_screenshot_retry', status: response.status, detail: (await response.text()).slice(0, 200) }));
		response = await capture('load');
	}
	if (!response.ok) {
		console.error('Browser Rendering API error:', response.status, (await response.text()).slice(0, 300));
		throw new ScreenshotError(response.status === 429 ? 'Too many screenshots just now; try again in a minute.' : 'That page couldn’t be captured.');
	}
	const image = await response.arrayBuffer();
	const size = jpegSize(image);
	if (!size) throw new ScreenshotError('That page couldn’t be captured.');
	const key = await fullScreenshotKey(normalizedUrl);
	await env.SCREENSHOTS.put(key, image, {
		httpMetadata: { contentType: 'image/jpeg' },
		customMetadata: { url: normalizedUrl.slice(0, 1000), capturedAt: new Date().toISOString(), width: String(size.width), height: String(size.height) }
	});
	return { key, ...size, bytes: image.byteLength, cached: false };
}

/** Screenshots of cited pages, captured with Browser Rendering and kept in R2 without expiry. */
import { httpUrl } from '../graph-curation';
import { publicUrl } from './publishing/public-fetch';
export interface ScreenshotEnvironment {
	SCREENSHOTS?: R2Bucket;
	CLOUDFLARE_ACCOUNT_ID?: string;
	CLOUDFLARE_API_TOKEN?: string;
}

/** The old key: a 32-bit hash, which two addresses can share. Only read now, and only when the stored address matches. */
function legacyHash(url: string): string {
	let hash = 0;
	for (let i = 0; i < url.length; i++) {
		hash = ((hash << 5) - hash) + url.charCodeAt(i);
		hash = hash & hash;
	}
	return Math.abs(hash).toString(36);
}
const legacyKey = (normalizedUrl: string) => `screenshots/${legacyHash(normalizedUrl)}.png`;

/** Where an address's screenshot is kept: named by its SHA-256, so no other address can take its place. */
export async function screenshotKey(normalizedUrl: string): Promise<string> {
	const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizedUrl)));
	return `screenshots/v2/${Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')}.png`;
}

/**
 * The address as it may be screenshotted: a public web page. Anything else (other schemes,
 * addresses with sign-ins, bare IPs, local names) is refused before the browser is asked.
 */
export function screenshotTarget(value: string): string | null {
	const address = httpUrl(value);
	if (!address) return null;
	try {
		// The same hostname rules as every other fetch the site makes for someone; http pages are allowed.
		publicUrl(address.replace(/^http:/, 'https:'));
		return address;
	} catch {
		return null;
	}
}

export async function cachedScreenshot(env: ScreenshotEnvironment, normalizedUrl: string): Promise<ArrayBuffer | null> {
	if (!env.SCREENSHOTS) return null;
	try {
		const cached = await env.SCREENSHOTS.get(await screenshotKey(normalizedUrl));
		if (cached) return await cached.arrayBuffer();
		const old = await env.SCREENSHOTS.get(legacyKey(normalizedUrl));
		if (!old) return null;
		if (old.customMetadata?.url !== normalizedUrl) { await old.body.cancel(); return null; }
		return await old.arrayBuffer();
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
			await env.SCREENSHOTS.put(await screenshotKey(normalizedUrl), imageData, {
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
		const normalizedUrl = screenshotTarget(url);
		if (!normalizedUrl) return false;
		if (await cachedScreenshot(env, normalizedUrl)) return true;
		await captureScreenshot(env, normalizedUrl);
		return true;
	} catch {
		return false;
	}
}

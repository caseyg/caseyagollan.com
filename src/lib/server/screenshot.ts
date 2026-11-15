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

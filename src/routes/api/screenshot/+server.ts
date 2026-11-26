import type { RequestHandler } from './$types';
import { cachedScreenshot, captureScreenshot, ScreenshotError, screenshotTarget } from '$lib/server/screenshot';
import { rateLimited } from '$lib/server/rate-limit';

const png = (imageData: ArrayBuffer, status: 'HIT' | 'MISS') =>
	new Response(imageData, {
		headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=604800', 'X-Cache-Status': status, 'X-Content-Type-Options': 'nosniff' }
	});

const failure = (error: string, status = 500) => Response.json({ error }, { status });

export const GET: RequestHandler = async ({ url, platform, request }) => {
	const targetUrl = url.searchParams.get('url');
	if (!targetUrl) return failure('URL parameter required', 400);

	// Public web pages only.
	const normalizedUrl = screenshotTarget(targetUrl);
	if (!normalizedUrl) return failure('Invalid URL', 400);

	const env = platform?.env ?? {};
	const cached = await cachedScreenshot(env, normalizedUrl);
	if (cached) return png(cached, 'HIT');

	// A fresh capture runs a browser and stores a file: a visitor gets a limited number a minute.
	const limited = await rateLimited(platform?.env?.FETCH_RATE_LIMITER, request, 'screenshot');
	if (limited) return limited;

	try {
		return png(await captureScreenshot(env, normalizedUrl), 'MISS');
	} catch (error) {
		if (error instanceof ScreenshotError) return failure(error.message);
		console.error('Screenshot capture error:', error);
		return failure('Screenshot capture failed');
	}
};

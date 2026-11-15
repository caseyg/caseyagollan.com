import type { RequestHandler } from './$types';
import { cachedScreenshot, captureScreenshot, ScreenshotError } from '$lib/server/screenshot';

const png = (imageData: ArrayBuffer, status: 'HIT' | 'MISS') =>
	new Response(imageData, {
		headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=604800', 'X-Cache-Status': status }
	});

const failure = (error: string, status = 500) => Response.json({ error }, { status });

export const GET: RequestHandler = async ({ url, platform }) => {
	const targetUrl = url.searchParams.get('url');
	if (!targetUrl) return failure('URL parameter required', 400);

	let normalizedUrl: string;
	try {
		normalizedUrl = new URL(targetUrl).toString();
	} catch {
		return failure('Invalid URL', 400);
	}

	const env = platform?.env ?? {};
	const cached = await cachedScreenshot(env, normalizedUrl);
	if (cached) return png(cached, 'HIT');

	try {
		return png(await captureScreenshot(env, normalizedUrl), 'MISS');
	} catch (error) {
		if (error instanceof ScreenshotError) return failure(error.message);
		console.error('Screenshot capture error:', error);
		return failure('Screenshot capture failed');
	}
};

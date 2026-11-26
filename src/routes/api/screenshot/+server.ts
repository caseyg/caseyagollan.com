import type { RequestHandler } from './$types';
import { cachedFullScreenshot, cachedScreenshot, captureScreenshot, fullScreenshot, ScreenshotError, type ScreenshotEnvironment } from '$lib/server/screenshot';
import { publicUrl } from '$lib/server/publishing/public-fetch';
import { isOwner } from '$lib/server/tables-api';

const picture = (imageData: ArrayBuffer | ReadableStream, status: 'HIT' | 'MISS', type = 'image/png') =>
	new Response(imageData, {
		headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=604800', 'X-Cache-Status': status, 'X-Content-Type-Options': 'nosniff' }
	});

const failure = (error: string, status = 500) => Response.json({ error }, { status });

/**
 * A page's screenshot: `?url=` its first screen, `&full=1` the whole page top to bottom (what the
 * chat's `table_render` puts on a table). Anyone is served a whole-page capture already kept; only
 * the signed-in owner has a new one taken, of public addresses only.
 */
export const GET: RequestHandler = async ({ url, platform, request }) => {
	const targetUrl = url.searchParams.get('url');
	if (!targetUrl) return failure('URL parameter required', 400);

	let normalizedUrl: string;
	try {
		normalizedUrl = new URL(targetUrl).toString();
	} catch {
		return failure('Invalid URL', 400);
	}

	const env: ScreenshotEnvironment = platform?.env ?? {};
	if (url.searchParams.has('full')) {
		try {
			let kept = await cachedFullScreenshot(env, normalizedUrl);
			if (!kept) {
				if (!(await isOwner(request, platform?.env))) return failure('No screenshot of that page has been taken.', 404);
				try { publicUrl(normalizedUrl); } catch { return failure('Only public https pages can be captured.', 400); }
				kept = await fullScreenshot(env, normalizedUrl);
			}
			const stored = await env.SCREENSHOTS?.get(kept.key);
			if (!stored) return failure('No screenshot of that page has been taken.', 404);
			return picture(stored.body, kept.cached ? 'HIT' : 'MISS', 'image/jpeg');
		} catch (error) {
			if (error instanceof ScreenshotError) return failure(error.message);
			console.error('Screenshot capture error:', error);
			return failure('Screenshot capture failed');
		}
	}

	const cached = await cachedScreenshot(env, normalizedUrl);
	if (cached) return picture(cached, 'HIT');

	try {
		return picture(await captureScreenshot(env, normalizedUrl), 'MISS');
	} catch (error) {
		if (error instanceof ScreenshotError) return failure(error.message);
		console.error('Screenshot capture error:', error);
		return failure('Screenshot capture failed');
	}
};

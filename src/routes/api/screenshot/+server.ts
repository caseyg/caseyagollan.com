import type { RequestHandler } from './$types';

// Hash a URL to create a cache key
function hashUrl(url: string): string {
	let hash = 0;
	for (let i = 0; i < url.length; i++) {
		const char = url.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash = hash & hash; // Convert to 32bit integer
	}
	return Math.abs(hash).toString(36);
}

export const GET: RequestHandler = async ({ url, platform }) => {
	const targetUrl = url.searchParams.get('url');

	if (!targetUrl) {
		return new Response(JSON.stringify({ error: 'URL parameter required' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// Validate URL
	let normalizedUrl: string;
	try {
		normalizedUrl = new URL(targetUrl).toString();
	} catch {
		return new Response(JSON.stringify({ error: 'Invalid URL' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const cacheKey = `screenshots/${hashUrl(normalizedUrl)}.png`;
	const r2 = platform?.env?.SCREENSHOTS;

	// Check R2 cache first
	if (r2) {
		try {
			const cached = await r2.get(cacheKey);
			if (cached) {
				console.log('📸 Screenshot cache HIT:', normalizedUrl);
				const imageData = await cached.arrayBuffer();
				return new Response(imageData, {
					headers: {
						'Content-Type': 'image/png',
						'Cache-Control': 'public, max-age=604800', // 7 days
						'X-Cache-Status': 'HIT'
					}
				});
			}
		} catch (e) {
			console.error('R2 read error:', e);
		}
	}

	console.log('📸 Screenshot cache MISS, calling Browser Rendering API:', normalizedUrl);

	// Get credentials from environment
	const accountId = platform?.env?.CLOUDFLARE_ACCOUNT_ID;
	const apiToken = platform?.env?.CLOUDFLARE_API_TOKEN;

	if (!accountId || !apiToken) {
		return new Response(JSON.stringify({ error: 'Browser Rendering API not configured' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	try {
		// Call Cloudflare Browser Rendering API
		const response = await fetch(
			`https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/screenshot`,
			{
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${apiToken}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					url: normalizedUrl,
					viewport: {
						width: 1280,
						height: 800
					},
					screenshotOptions: {
						type: 'png',
						clip: {
							x: 0,
							y: 0,
							width: 1280,
							height: 800
						}
					},
					gotoOptions: {
						waitUntil: 'networkidle0',
						timeout: 15000
					}
				})
			}
		);

		if (!response.ok) {
			const errorText = await response.text();
			console.error('Browser Rendering API error:', response.status, errorText);
			return new Response(JSON.stringify({ error: 'Failed to capture screenshot' }), {
				status: 500,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const imageData = await response.arrayBuffer();

		// Store in R2 cache
		if (r2) {
			try {
				await r2.put(cacheKey, imageData, {
					httpMetadata: {
						contentType: 'image/png'
					},
					customMetadata: {
						url: normalizedUrl,
						capturedAt: new Date().toISOString()
					}
				});
				console.log('📸 Screenshot cached in R2:', cacheKey);
			} catch (e) {
				console.error('R2 write error:', e);
			}
		}

		return new Response(imageData, {
			headers: {
				'Content-Type': 'image/png',
				'Cache-Control': 'public, max-age=604800', // 7 days
				'X-Cache-Status': 'MISS'
			}
		});
	} catch (error) {
		console.error('Screenshot capture error:', error);
		return new Response(JSON.stringify({ error: 'Screenshot capture failed' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};

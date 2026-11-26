/**
 * Per-visitor limits for the endpoints anyone can call that cost money or fetch other sites:
 * the homepage's insights and bio, and screenshots. Backed by Workers rate limiting bindings
 * (`ratelimits` in wrangler.jsonc). The limit is per address and per Cloudflare location, so it
 * slows one abusive client down; it is not a spending cap.
 */
export interface RateLimitEnvironment {
	/** Model calls: /api/generate-insight and /api/update-document. */
	AI_RATE_LIMITER?: RateLimit;
	/** Fresh screenshots (/api/screenshot misses). */
	FETCH_RATE_LIMITER?: RateLimit;
}

/** The refusal to send when this visitor has asked too often, or null to carry on. Fails open without a binding. */
export async function rateLimited(limiter: Pick<RateLimit, 'limit'> | undefined, request: Request, scope: string): Promise<Response | null> {
	if (!limiter) return null;
	const address = request.headers.get('cf-connecting-ip') ?? 'unknown';
	try {
		const { success } = await limiter.limit({ key: `${scope}:${address}` });
		if (success) return null;
	} catch {
		// A limiter that can't answer must not take the page down with it.
		return null;
	}
	return Response.json({ error: 'Too many requests. Try again in a minute.' }, { status: 429, headers: { 'retry-after': '60', 'cache-control': 'no-store' } });
}

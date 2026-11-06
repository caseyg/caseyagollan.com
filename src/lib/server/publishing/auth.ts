export class ProtocolError extends Error {
	constructor(public readonly status: number, public readonly code: string, message: string) {
		super(message);
		this.name = 'ProtocolError';
	}
}

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
export interface AuthConfig { me: string; introspectionEndpoint: string; introspectionToken: string }

export function profileUrl(value: string): string {
	const url = new URL(value);
	if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.port) throw new Error('Invalid profile URL');
	return url.href;
}

/** The provider URL and server credential come only from operator configuration. */
export async function authorize(request: Request, scope: string, config: AuthConfig, fetcher: Fetcher = fetch, bodyToken?: string) {
	const invalid = () => new ProtocolError(401, 'invalid_token', 'Invalid access token');
	if (new URL(request.url).searchParams.has('access_token')) throw new ProtocolError(400, 'invalid_request', 'Use a header or form body for the token');
	let owner: string;
	try {
		owner = profileUrl(config.me);
		const endpoint = new URL(config.introspectionEndpoint);
		if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.hash || !config.introspectionToken.trim()) throw new Error();
	} catch { throw new ProtocolError(503, 'temporarily_unavailable', 'Authorization is not configured'); }
	const header = request.headers.get('Authorization');
	if (header && bodyToken) throw new ProtocolError(400, 'invalid_request', 'Send the token once');
	const token = header?.match(/^Bearer ([A-Za-z0-9\-._~+/]+=*)$/i)?.[1] ?? (!header ? bodyToken : undefined);
	if (!token || token.length > 8192) throw invalid();
	let response: Response;
	try {
		response = await fetcher(config.introspectionEndpoint, {
			method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(8000),
			headers: { Authorization: `Bearer ${config.introspectionToken}`, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ token }).toString()
		});
	} catch { throw new ProtocolError(503, 'temporarily_unavailable', 'Authorization service unavailable'); }
	if (!response.ok) {
		if (response.status >= 500 || response.status === 429) throw new ProtocolError(503, 'temporarily_unavailable', 'Authorization service unavailable');
		throw invalid();
	}
	let data: Record<string, unknown>;
	try {
		const value: unknown = await response.json();
		if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
		data = value as Record<string, unknown>;
		if (data.active !== true || typeof data.me !== 'string' || profileUrl(data.me) !== owner ||
			typeof data.scope !== 'string' || typeof data.client_id !== 'string' || !data.client_id ||
			(data.exp !== undefined && (typeof data.exp !== 'number' || !Number.isFinite(data.exp) || data.exp <= Date.now() / 1000))) throw invalid();
		const client = new URL(data.client_id);
		if (!['https:', 'http:'].includes(client.protocol)) throw invalid();
	} catch { throw invalid(); }
	if (scope && !(data.scope as string).split(/\s+/).includes(scope)) throw new ProtocolError(403, 'insufficient_scope', `Requires ${scope} scope`);
	return { me: owner, clientId: data.client_id as string };
}

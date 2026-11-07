import { authorize, ProtocolError, type Fetcher } from './auth';
import type { PublishingConfig } from './micropub';

export const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const maxRequestBytes = MAX_MEDIA_BYTES + 64 * 1024;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Expose-Headers': 'Location', 'Cache-Control': 'no-store' };
const types: Record<string, string> = {
	'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif',
	'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
	'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/webm': 'webm', 'audio/flac': 'flac'
};
const socialKeyPattern = /^social\/[a-f0-9]{64}\.(?:png|jpg|gif|webp)$/;
const keyPattern = /^\d{4}\/(?:0[1-9]|1[0-2])\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(?:jpg|png|gif|webp|avif|mp4|mov|webm|mp3|m4a|ogg|wav|flac)$/;
const error = (status: number, message: string) => new ProtocolError(status, status === 503 ? 'temporarily_unavailable' : 'invalid_request', message);

function matchesType(bytes: Uint8Array, type: string): boolean {
	const starts = (...magic: number[]) => magic.every((byte, index) => bytes[index] === byte);
	const text = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
	switch (type) {
		case 'image/jpeg': return starts(255, 216, 255);
		case 'image/png': return starts(137, 80, 78, 71, 13, 10, 26, 10);
		case 'image/gif': return ['GIF87a', 'GIF89a'].includes(text(0, 6));
		case 'image/webp': return text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP';
		case 'image/avif': return text(4, 8) === 'ftyp' && /avif|avis/.test(text(8, 64));
		case 'video/mp4': case 'video/quicktime': case 'audio/mp4': return text(4, 8) === 'ftyp' && !/avif|avis/.test(text(8, 64));
		case 'video/webm': case 'audio/webm': return starts(26, 69, 223, 163);
		case 'audio/mpeg': return text(0, 3) === 'ID3' || (bytes[0] === 255 && (bytes[1] & 224) === 224);
		case 'audio/ogg': return text(0, 4) === 'OggS';
		case 'audio/wav': return text(0, 4) === 'RIFF' && text(8, 12) === 'WAVE';
		case 'audio/flac': return text(0, 4) === 'fLaC';
		default: return false;
	}
}

async function boundedBody(request: Request): Promise<Uint8Array<ArrayBuffer>> {
	const length = request.headers.get('Content-Length');
	if (length && (!/^\d+$/.test(length) || Number(length) > maxRequestBytes)) throw error(413, 'Upload request exceeds 25 MiB plus multipart metadata');
	const reader = request.body?.getReader();
	if (!reader) throw error(400, 'Missing upload');
	const chunks: Uint8Array[] = [];
	let size = 0;
	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > maxRequestBytes) { await reader.cancel(); throw error(413, 'Upload request exceeds 25 MiB plus multipart metadata'); }
		chunks.push(value);
	}
	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
	return bytes;
}

export function createMediaHandler(config: PublishingConfig | undefined, bucket: R2Bucket | undefined, dependencies: { fetcher?: Fetcher; now?: () => Date; id?: () => string } = {}) {
	return async (request: Request): Promise<Response> => {
		try {
			if (!config || !bucket) throw error(503, 'Media publishing is not configured');
			let publicOrigin: URL | undefined;
			if (config.mediaBaseUrl) {
				try {
					publicOrigin = new URL(config.mediaBaseUrl);
					if (publicOrigin.protocol !== 'https:' || publicOrigin.username || publicOrigin.password || publicOrigin.port || publicOrigin.pathname !== '/' || publicOrigin.search || publicOrigin.hash) throw new Error();
				} catch { throw error(503, 'Invalid public media origin'); }
			}
			if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
			if (request.method !== 'POST') return new Response(null, { status: 405, headers: { ...cors, Allow: 'POST, OPTIONS' } });
			await authorize(request, 'media', config, dependencies.fetcher);
			const contentType = request.headers.get('Content-Type') ?? '';
			if (!/^multipart\/form-data\s*;/i.test(contentType)) throw error(415, 'Use multipart/form-data with one file');
			const bytes = await boundedBody(request);
			let form: FormData;
			try { form = await new Response(bytes, { headers: { 'Content-Type': contentType } }).formData(); }
			catch { throw error(400, 'Malformed multipart upload'); }
			const files = form.getAll('file');
			if (files.length !== 1 || typeof files[0] === 'string' || [...form.keys()].some(key => key !== 'file')) throw error(400, 'Send exactly one file');
			const file = files[0];
			if (!file.size) throw error(400, 'File is empty');
			if (file.size > MAX_MEDIA_BYTES) throw error(413, 'File exceeds 25 MiB');
			const type = file.type.toLowerCase();
			const extension = types[type];
			if (!extension || !matchesType(new Uint8Array(await file.slice(0, 64).arrayBuffer()), type)) throw error(415, 'Unsupported or mismatched media type');
			const now = dependencies.now?.() ?? new Date();
			const key = `${now.toISOString().slice(0, 7).replace('-', '/')}/${dependencies.id?.() ?? crypto.randomUUID()}.${extension}`;
			if (!keyPattern.test(key)) throw error(503, 'Could not generate media key');
			try {
				const result = await bucket.put(`publishing/${key}`, await file.arrayBuffer(), { onlyIf: { etagDoesNotMatch: '*' }, httpMetadata: { contentType: type, cacheControl: 'public, max-age=31536000, immutable' } });
				if (!result) throw new Error('Key collision');
			} catch { throw error(503, 'Media storage unavailable; check before retrying'); }
			return new Response(null, { status: 201, headers: { ...cors, Location: publicOrigin ? new URL(`publishing/${key}`, publicOrigin).href : new URL(`/media/${key}`, request.url).href } });
		} catch (cause) {
			const failure = cause instanceof ProtocolError ? cause : error(400, 'Invalid upload request');
			return Response.json({ error: failure.code, error_description: failure.message }, { status: failure.status, headers: { ...cors, ...(failure.status === 401 ? { 'WWW-Authenticate': 'Bearer' } : {}) } });
		}
	};
}

/** Public, immutable media only. Publishing disablement must not break existing media URLs. */
export async function serveMedia(request: Request, key: string, bucket?: R2Bucket): Promise<Response> {
	if (!keyPattern.test(key) && !socialKeyPattern.test(key)) return new Response(null, { status: 404 });
	if (!bucket) return new Response(null, { status: 503 });
	if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
	try {
		const object = await bucket.head(`publishing/${key}`);
		if (!object || !types[object.httpMetadata?.contentType ?? '']) return new Response(null, { status: 404 });
		const headers = new Headers({ 'Content-Type': object.httpMetadata!.contentType!, 'Content-Length': String(object.size), ETag: object.httpEtag, 'Cache-Control': 'public, max-age=31536000, immutable', 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Access-Control-Allow-Origin': '*' });
		const etags = request.headers.get('If-None-Match')?.split(',').map(tag => tag.trim().replace(/^W\//, ''));
		if (etags?.some(tag => tag === '*' || tag === object.httpEtag)) { headers.delete('Content-Length'); return new Response(null, { status: 304, headers }); }
		if (request.method === 'HEAD') return new Response(null, { headers });
		let range: { offset: number; length: number } | undefined;
		const requestedRange = request.headers.get('Range');
		if (requestedRange && (!request.headers.has('If-Range') || request.headers.get('If-Range') === object.httpEtag)) {
			const match = requestedRange.match(/^bytes=(\d*)-(\d*)$/);
			let start = NaN, end = NaN;
			if (match && (match[1] || match[2])) {
				start = match[1] ? Number(match[1]) : Math.max(0, object.size - Number(match[2]));
				end = match[1] ? (match[2] ? Math.min(Number(match[2]), object.size - 1) : object.size - 1) : object.size - 1;
				if (!match[1] && Number(match[2]) === 0) start = NaN;
			}
			if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= object.size || end < start) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${object.size}`, 'Cache-Control': 'no-store' } });
			range = { offset: start, length: end - start + 1 };
			headers.set('Content-Length', String(range.length));
			headers.set('Content-Range', `bytes ${start}-${end}/${object.size}`);
		}
		const result = await bucket.get(`publishing/${key}`, range ? { range } : undefined);
		if (!result) return new Response(null, { status: 404 });
		return new Response(result.body, { status: range ? 206 : 200, headers });
	} catch { return new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}

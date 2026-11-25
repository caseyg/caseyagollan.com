/**
 * The /chat assistant's `view_image` tool: fetch a picture (a photo post's image, a block's
 * cover, any public image) and hand it to the model to look at. Public hosts only, through
 * `safePublicImageFetch`; this site's own images come from its assets. With the Worker's
 * `IMAGES` binding the picture is shrunk to a size models read well, which also keeps the
 * thread's stored history small.
 */
import { safePublicImageFetch, type PublicFetcher } from '../publishing/public-fetch';

/** The long side models are given; more costs tokens and shows them nothing new. */
export const VIEW_SIDE = 1024;
/** Without `IMAGES` to shrink it, the largest picture passed along as is. */
export const VIEW_MAX_BYTES = 1_200_000;
const TYPES = /^image\/(jpeg|png|webp|gif)$/;

export interface ViewedImage { url: string; mimeType: string; data: string; bytes: number }

const base64 = (bytes: Uint8Array) => {
	let binary = '';
	for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
	return btoa(binary);
};

export async function viewImage(address: string, options: { origin: string; assets?: Pick<Fetcher, 'fetch'>; images?: ImagesBinding; fetcher?: PublicFetcher }): Promise<ViewedImage> {
	let url: URL;
	try { url = new URL(address, options.origin); } catch { throw new Error('That isn’t a web address.'); }
	if (!/^https?:$/.test(url.protocol)) throw new Error('Only web addresses can be looked at.');
	const own = url.origin === new URL(options.origin).origin;
	const headers = { accept: 'image/jpeg,image/png,image/webp,image/gif' };
	const response = own && options.assets
		? await options.assets.fetch(new Request(url.href, { headers }))
		: await (options.fetcher ?? safePublicImageFetch)(url.href, { headers, redirect: 'follow' });
	if (!response.ok) throw new Error(`${url.host} answered ${response.status}.`);
	const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
	if (!type.startsWith('image/')) throw new Error(`${url.host} sent ${type || 'something'} rather than a picture.`);
	let bytes = new Uint8Array(await response.arrayBuffer());
	let mimeType = type;
	if (options.images) {
		try {
			const shrunk = await options.images.input(new Blob([bytes]).stream()).transform({ width: VIEW_SIDE, height: VIEW_SIDE, fit: 'scale-down' }).output({ format: 'image/jpeg', quality: 75 });
			bytes = new Uint8Array(await shrunk.response().arrayBuffer());
			mimeType = 'image/jpeg';
		} catch { /* unreadable to the binding: try the original */ }
	}
	if (!TYPES.test(mimeType)) throw new Error(`Pictures of type ${mimeType} can’t be looked at.`);
	if (bytes.length > VIEW_MAX_BYTES) throw new Error('That picture is too large to look at here.');
	return { url: response.url || url.href, mimeType, data: base64(bytes), bytes: bytes.length };
}

/** A data URL as an image block for the model, or null for anything but a small JPEG, PNG or WebP. */
export function imageFromDataUrl(value: unknown): { mimeType: string; data: string } | null {
	if (typeof value !== 'string') return null;
	const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value);
	if (!match || match[2].length > VIEW_MAX_BYTES * 1.4) return null;
	return { mimeType: match[1], data: match[2] };
}

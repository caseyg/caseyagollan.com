import type { RequestHandler } from './$types';
import { serveMedia } from '$lib/server/publishing/media';

export const GET: RequestHandler = ({ request, params, platform }) => serveMedia(request, params.key, platform?.env?.PUBLISHING_MEDIA);
export const HEAD = GET;

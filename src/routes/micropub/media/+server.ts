import type { RequestHandler } from './$types';
import { publishingConfig } from '$lib/server/publishing/config';
import { createMediaHandler } from '$lib/server/publishing/media';

const handle: RequestHandler = ({ request, platform }) => createMediaHandler(publishingConfig(platform?.env), platform?.env?.PUBLISHING_MEDIA)(request);
export const POST = handle;
export const OPTIONS = handle;

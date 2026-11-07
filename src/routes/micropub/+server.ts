import type { RequestHandler } from './$types';
import { publishingConfig } from '$lib/server/publishing/config';
import { createMicropubHandler } from '$lib/server/publishing/micropub';

const handle: RequestHandler = ({ request, platform }) => createMicropubHandler(publishingConfig(platform?.env))(request);

export const GET = handle;
export const POST = handle;
export const OPTIONS = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;

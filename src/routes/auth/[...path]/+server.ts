import type { RequestHandler } from './$types';
import { createIndieAuthHandler } from '$lib/server/indieauth/protocol';
const handle: RequestHandler = ({ request, platform }) => createIndieAuthHandler(platform?.env ?? {})(request);
export const GET = handle;
export const POST = handle;
export const OPTIONS = handle;

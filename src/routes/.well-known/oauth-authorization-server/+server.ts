import type { RequestHandler } from './$types';
import { createIndieAuthHandler } from '$lib/server/indieauth/protocol';
export const GET: RequestHandler = ({ request, platform }) => createIndieAuthHandler(platform?.env ?? {})(request);
export const OPTIONS = GET;

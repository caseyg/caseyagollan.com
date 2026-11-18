import type { RequestHandler } from './$types';
import { publishingConfig } from '$lib/server/publishing/config';
import { createMicropubHandler } from '$lib/server/publishing/micropub';
import { categoryList } from '$lib/server/publishing/micropub-queries';
import { getAllPosts, getAllTags } from '$lib/posts';

// Tags come from the posts bundled with this deploy; each publish rebuilds, so new tags follow.
// The bundle never changes while this isolate lives, so parse it once.
let tags: Promise<string[]> | undefined;
const categories = () => tags ??= getAllPosts().then(posts => categoryList(getAllTags(posts)));

const handle: RequestHandler = ({ request, platform }) => createMicropubHandler(publishingConfig(platform?.env), { categories })(request);

export const GET = handle;
export const POST = handle;
export const OPTIONS = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;

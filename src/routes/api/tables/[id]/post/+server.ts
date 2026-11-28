import type { RequestHandler } from './$types';
import { draftHref, TABLE_PICTURE_MAX_BYTES, tablePostFields } from '$lib/table-post';
import { isPublished } from '$lib/tables';
import { readTable } from '$lib/server/tables';
import { ownerBucket, PRIVATE } from '$lib/server/tables-api';
import { ProtocolError } from '$lib/server/publishing/auth';
import { createDraftStore, entryFromFields } from '$lib/server/publishing/composer';
import { draftsConfig, publishingConfig } from '$lib/server/publishing/config';
import { storeMedia } from '$lib/server/publishing/media';

export const prerender = false;

const refuse = (status: number, error: string) => Response.json({ error }, { status, headers: PRIVATE });

/**
 * Starts a post from a table and answers with where its draft opens in the composer. A JSON body
 * (`{ as: 'embed' }`) makes a note that frames the table; an image body is a picture of the
 * table, drawn by the owner's open canvas, kept with the site's media and set as a photo post.
 * The draft goes to the private drafts repository, like any the composer saves. Owner only.
 */
export const POST: RequestHandler = async ({ params, request, platform }) => {
	const env = platform?.env;
	const bucket = await ownerBucket(request, env);
	if (bucket instanceof Response) return bucket;
	const table = await readTable(bucket, params.id);
	if (!table) return refuse(404, 'No such table.');
	const config = publishingConfig(env);
	const store = draftsConfig(env);
	if (!config || !store) return refuse(503, 'Drafts aren’t kept here, so the post has nowhere to go. Try it on caseyagollan.com.');

	const type = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
	try {
		let picture: string | undefined;
		if (type.startsWith('image/')) {
			if (!config.mediaBucket) return refuse(503, 'Pictures can’t be kept here.');
			if (Number(request.headers.get('content-length') ?? 0) > TABLE_PICTURE_MAX_BYTES) return refuse(413, 'That picture is too large.');
			const bytes = await request.arrayBuffer();
			if (bytes.byteLength > TABLE_PICTURE_MAX_BYTES) return refuse(413, 'That picture is too large.');
			picture = await storeMedia(config, config.mediaBucket, new File([bytes], 'table', { type }), {}, request.url);
		} else {
			const body = (await request.json().catch(() => null)) as { as?: unknown } | null;
			if (body?.as !== 'embed') return refuse(400, 'Say how the table goes in the post: embedded, or send its picture.');
		}
		const { kind, fields } = tablePostFields(picture ? 'picture' : 'embed', { id: table.id, name: table.name, published: isPublished(table) }, picture);
		let entry;
		try { entry = entryFromFields(kind, fields, config.timeZone); } catch { /* A draft may be incomplete. */ }
		const saved = await createDraftStore(store).save(kind, fields, undefined, entry);
		return Response.json({ href: draftHref(kind, saved.id), kind, published: isPublished(table) }, { status: 201, headers: PRIVATE });
	} catch (cause) {
		if (cause instanceof ProtocolError) return refuse(cause.status, cause.message);
		throw cause;
	}
};

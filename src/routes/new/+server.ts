import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** The composer opens on a note, like a social app's compose box. */
export const GET: RequestHandler = ({ url }) => redirect(307, `/new/note/${url.search}`);

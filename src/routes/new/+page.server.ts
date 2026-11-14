import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const prerender = false;

/**
 * The composer opens on a note, like a social app's compose box. This is a page
 * route rather than an endpoint so client-side links resolve here instead of
 * matching the dated `[year]` archive route.
 */
export const load: PageServerLoad = ({ url }) => redirect(307, `/new/note/${url.search}`);

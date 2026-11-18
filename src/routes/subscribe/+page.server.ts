import type { Facets } from '$lib/posts-filter';
import type { PageServerLoad } from './$types';

// The Posts crumb names no selection, and its menu loads after the page.
export const load: PageServerLoad = () => ({ postsMenuSelection: {} as Partial<Facets> });

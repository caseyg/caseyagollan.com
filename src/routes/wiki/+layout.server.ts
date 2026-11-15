import { getWiki } from '$lib/server/wiki';
import { wikiPath } from '$lib/wiki/resolve';
import type { MenuOption } from '$lib/components/ui';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = () => ({
	wikiMenu: [
		{ value: '', label: 'Wiki home', href: '/wiki/', icon: '📓' },
		...getWiki().pages.map((page): MenuOption => ({ value: page.slug, label: page.title, href: wikiPath(page.slug) }))
	] satisfies MenuOption[]
});

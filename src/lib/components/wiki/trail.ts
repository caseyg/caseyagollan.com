import { page } from '$app/state';
import type { MenuOption, Segment } from '$lib/components/ui';

/** The first segment of every wiki trail; its emoji matches the corner navigation. */
export const WIKI_CRUMB: Segment = { label: 'Wiki', href: '/wiki/', icon: '📓' };

/** The Wiki segment as a menu of every page, like Obsidian's file explorer. `active` marks the page being read. */
export function wikiCrumb(active?: string, current = false): Segment {
	const menu = page.data.wikiMenu as MenuOption[] | undefined;
	return { ...WIKI_CRUMB, current, ...(menu?.length ? { menu, menuActive: active ?? '' } : {}) };
}

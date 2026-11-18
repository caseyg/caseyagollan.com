/**
 * Micropub `q=category` and `q=contact`: the lists clients autocomplete from.
 * https://indieweb.org/Micropub-extensions#Query_for_Category.2FTag_List
 * https://indieweb.org/Micropub-extensions#Query_for_Contacts
 */
import follows from '../../data/social-follows.json';

export interface FollowedAccount { service: string; handle: string; name: string }

/** One person to tag, in the shape Micropub clients expect from `q=contact`. */
export interface Contact {
	name: string;
	nickname: string;
	url: string;
	/** Their handle on each network, such as `{ mastodon: 'aaronpk@aaronparecki.com' }`. */
	silos: Record<string, string>;
}

const fold = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();

/** A profile link for an account: Mastodon by its instance, Bluesky on bsky.app. */
export function accountUrl(account: FollowedAccount): string | undefined {
	if (account.service === 'mastodon') {
		const [user, host] = account.handle.replace(/^@/, '').split('@');
		return user && host ? `https://${host}/@${user}` : undefined;
	}
	if (account.service === 'bluesky') return `https://bsky.app/profile/${account.handle}`;
	return undefined;
}

// Mastodon first: it is where Casey posts as @caseyg@social.coop.
const SERVICE_ORDER = ['mastodon', 'bluesky'];

/** Followed accounts as contacts. Accounts sharing a display name are one person on several networks. */
export function contactsFrom(accounts: FollowedAccount[]): Contact[] {
	const groups = new Map<string, FollowedAccount[]>();
	for (const account of accounts) {
		if (!accountUrl(account)) continue;
		const key = fold(account.name.trim() || account.handle);
		groups.set(key, [...groups.get(key) ?? [], account]);
	}
	return [...groups.values()].map(group => {
		const sorted = [...group].sort((a, b) => SERVICE_ORDER.indexOf(a.service) - SERVICE_ORDER.indexOf(b.service));
		const primary = sorted[0];
		const silos: Record<string, string> = {};
		for (const account of sorted) silos[account.service] ??= account.handle;
		return { name: primary.name.trim() || primary.handle, nickname: primary.handle, url: accountUrl(primary)!, silos };
	}).sort((a, b) => fold(a.name).localeCompare(fold(b.name)));
}

let cached: Contact[] | undefined;
export const followedContacts = () => cached ??= contactsFrom((follows as { accounts: FollowedAccount[] }).accounts);

/** Ranks matches: a name or handle that starts with the search beats one that only contains it. */
function rank(haystacks: string[], search: string): number {
	if (!search) return 0;
	const folded = haystacks.map(fold);
	if (folded.some(value => value.startsWith(search) || value.split(/[\s@._-]+/).some(word => word.startsWith(search)))) return 1;
	return folded.some(value => value.includes(search)) ? 2 : 0;
}

function matching<T>(items: T[], search: string | null, fields: (item: T) => string[], limit: number | undefined) {
	const term = fold((search ?? '').trim().replace(/^[#@]/, ''));
	const ranked = items.map((item, index) => ({ item, index, rank: term ? rank(fields(item), term) : 1 })).filter(entry => entry.rank > 0);
	ranked.sort((a, b) => a.rank - b.rank || a.index - b.index);
	return ranked.slice(0, limit).map(entry => entry.item);
}

/** Tags most used first; spellings that differ only in case collapse to the most used one. */
export function categoryList(counts: Iterable<[string, number]>): string[] {
	const best = new Map<string, [string, number]>();
	const totals = new Map<string, number>();
	for (const [tag, count] of counts) {
		const key = fold(tag);
		totals.set(key, (totals.get(key) ?? 0) + count);
		if (!best.has(key) || best.get(key)![1] < count) best.set(key, [tag, count]);
	}
	return [...best.entries()].sort((a, b) => totals.get(b[0])! - totals.get(a[0])! || a[1][0].localeCompare(b[1][0])).map(([, [tag]]) => tag);
}

export const categoryQuery = (tags: string[], filter: string | null, limit?: number) => ({ categories: matching(tags, filter, tag => [tag], limit) });

export const contactQuery = (contacts: Contact[], search: string | null, limit?: number) =>
	({ contacts: matching(contacts, search, contact => [contact.name, contact.nickname, ...Object.values(contact.silos)], limit) });

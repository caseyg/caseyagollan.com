/**
 * A new post from a table: the table itself, framed live in the post, or a picture of it as it
 * stands. The post starts as a composer draft, so nothing is public until Casey publishes it.
 */
import type { ComposerFields, ComposerKind } from './composer-kinds';
import { SITE_URL } from './feeds';

export type TablePostAs = 'embed' | 'picture';

/** What the menu offers, and what each choice does. */
export const TABLE_POST_CHOICES: { value: TablePostAs; label: string; hint: string }[] = [
	{ value: 'embed', label: 'Embed the table', hint: 'A live table readers can pan, zoom and open' },
	{ value: 'picture', label: 'A picture of the table', hint: 'How it looks now, as a photo' }
];

/** A table's public address. Alone on a line of a post, it is drawn as the table (`renderContent`). */
export const tableAddress = (id: string) => `${SITE_URL}/tables/${id}/`;

/** The longest side of a table's picture, in pixels. */
export const TABLE_PICTURE_MAX_SIDE = 2400;
export const TABLE_PICTURE_MAX_BYTES = 12 * 1024 * 1024;

/**
 * The composer fields a table's post starts with: a note holding the table's address on its own
 * line, or a photo post with the picture. A picture links back only to a table visitors can open.
 */
export function tablePostFields(as: TablePostAs, table: { id: string; name: string; published?: boolean }, picture?: string): { kind: ComposerKind; fields: ComposerFields } {
	const name = table.name.replace(/\s+/g, ' ').trim() || 'Untitled table';
	const address = tableAddress(table.id);
	if (as === 'embed') return { kind: 'note', fields: { content: `${name}\n\n${address}` } };
	if (!picture) throw new Error('A picture post needs its picture.');
	// Brackets would end the link's text early.
	const linked = table.published !== false ? `[${name.replace(/[[\]\\]/g, '\\$&')}](${address})` : name;
	return { kind: 'photo', fields: { content: linked, photo: [picture], 'photo-alt': [`A table of blocks: ${name}`] } };
}

/** Where a draft opens in the composer. */
export const draftHref = (kind: ComposerKind, id: string) => `/new/${kind}/?draft=${encodeURIComponent(id)}`;

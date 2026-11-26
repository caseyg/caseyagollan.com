/**
 * Live cursors and cursor chat: the messages a page and its cursor room exchange, and the rules
 * both ends apply to them. The room is a Durable Object (`CursorRoom`,
 * `src/lib/server/cursors/room.ts`), one per page, reached at `/parties/cursors/<room>`.
 *
 * Nothing here is stored: a cursor lives as long as its connection, and a chat message as long as
 * its sender keeps it up.
 */

/** The party name PartyServer gives the `CURSORS` binding. */
export const CURSOR_PARTY = 'cursors';

/** The longest chat message, in characters. */
export const CHAT_MAX_LENGTH = 64;

/** How often a page sends its cursor, at most. */
export const MOVE_INTERVAL_MS = 50;

/** How long a sent chat message stays up after its sender stops typing. */
export const CHAT_LINGER_MS = 5000;

/** Visitors on one page at once; the room turns away anyone past this. */
export const ROOM_CAPACITY = 64;

/**
 * Cursor colors: bright enough to read on the site's gray, none of them the accent blue,
 * which means "you can click this" everywhere else.
 */
export const CURSOR_COLORS = ['#ff3b6b', '#ff8a00', '#ffd400', '#2ee66b', '#00d4d4', '#b26bff', '#ff5ce1', '#ffffff'] as const;

/**
 * Where a cursor is. `x` is a share of the viewport's width, so it lands on the same column of a
 * page whatever the window; `y` is in page pixels from the top of the document.
 */
export interface CursorPosition {
	x: number;
	y: number;
}

export interface Cursor {
	/** Unset while the pointer is outside the window or the visitor is on a touch screen. */
	position?: CursorPosition;
	color: string;
	/** What the visitor is typing or just said. */
	message?: string;
}

/** A page to its room. */
export type ClientMessage =
	| { type: 'move'; x: number; y: number }
	| { type: 'leave' }
	| { type: 'chat'; message: string };

/** A room to its pages. */
export type ServerMessage =
	| { type: 'sync'; self: string; cursors: Record<string, Cursor> }
	| { type: 'update'; id: string; cursor: Cursor }
	| { type: 'remove'; id: string };

/** The tallest page a position can name; anything past it is noise. */
const MAX_Y = 1_000_000;

/** Reads a page's message, or `null` for anything malformed. Rooms never trust what pages send. */
export function parseClientMessage(raw: unknown): ClientMessage | null {
	if (typeof raw !== 'string' || raw.length > 512) return null;
	let data: unknown;
	try {
		data = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!data || typeof data !== 'object') return null;
	const message = data as Record<string, unknown>;
	if (message.type === 'leave') return { type: 'leave' };
	if (message.type === 'move') {
		const { x, y } = message;
		if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return null;
		return { type: 'move', x: clamp(x, 0, 1), y: clamp(y, 0, MAX_Y) };
	}
	if (message.type === 'chat' && typeof message.message === 'string') return { type: 'chat', message: cleanChat(message.message) };
	return null;
}

/** One line of plain text: control characters and runs of space collapsed, cut to the limit. */
export function cleanChat(text: string): string {
	const line = [...text].map((char) => (invisible(char.codePointAt(0) ?? 0) ? ' ' : char)).join('').replace(/\s+/g, ' ').trimStart();
	return [...line].slice(0, CHAT_MAX_LENGTH).join('');
}

/** Control characters, zero-width marks and direction overrides, which could disguise a message. */
function invisible(code: number) {
	return code < 0x20 || (code >= 0x7f && code <= 0x9f) || (code >= 0x200b && code <= 0x200f) || (code >= 0x2028 && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069);
}

/** The room for a page: its path, without a trailing slash or query. */
export function cursorRoom(pathname: string): string {
	const path = pathname.replace(/\/+$/, '') || '/';
	return path.slice(0, 200);
}

/** Pages that don't show cursors: the owner's own tools, where nobody else should be watching. */
export function cursorsAllowed(pathname: string): boolean {
	return !/^\/(new|editor|account|auth|oauth|micropub|syndicate)(\/|$)/.test(pathname) && !/\/(edit|syndicate)\/?$/.test(pathname);
}

/** A steady color for a connection, so a visitor keeps theirs if the room restarts. */
export function cursorColor(id: string): string {
	let hash = 0;
	for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
	return CURSOR_COLORS[hash % CURSOR_COLORS.length];
}

/** Text color for a bubble in `color`: near-black on the light colors, white on the rest. */
export function cursorInk(color: string): string {
	const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
	if (!match) return '#fff';
	const [r, g, b] = match.slice(1).map((hex) => parseInt(hex, 16) / 255);
	return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? '#1a1a1a' : '#fff';
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

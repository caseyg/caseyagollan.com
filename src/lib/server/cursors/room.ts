import { Server, type Connection, type ConnectionContext, type WSMessage } from 'partyserver';
import { cursorColor, parseClientMessage, ROOM_CAPACITY, type Cursor, type ServerMessage } from '../../cursors';

/** Messages one connection may send per second before the rest are dropped. */
const MESSAGES_PER_SECOND = 40;

/**
 * One page's live cursors and cursor chat. Each visitor is a WebSocket; their cursor is kept on
 * the connection itself, so it survives the object hibernating between messages, and nothing is
 * written to storage. A message from one visitor goes to everyone else on the page.
 */
export class CursorRoom extends Server {
	static options = { hibernate: true };

	/** Per-connection message budget for the current second. Lost on hibernation, which is fine. */
	#budget = new Map<string, { second: number; count: number }>();

	onConnect(connection: Connection<Cursor>, { request }: ConnectionContext) {
		if ([...this.getConnections()].length > ROOM_CAPACITY) {
			connection.close(1013, 'This page is full');
			return;
		}
		const country = (request as Request & { cf?: { country?: string } }).cf?.country;
		const cursor: Cursor = { color: cursorColor(connection.id), ...(country ? { country } : {}) };
		connection.setState(cursor);

		const cursors: Record<string, Cursor> = {};
		for (const other of this.getConnections<Cursor>()) {
			if (other.id !== connection.id && other.state) cursors[other.id] = other.state as Cursor;
		}
		send(connection, { type: 'sync', self: connection.id, cursors });
		// Others learn of a visitor once they move; an unmoved cursor has nothing to show.
	}

	onMessage(connection: Connection<Cursor>, raw: WSMessage) {
		if (!this.#allow(connection.id)) return;
		const message = parseClientMessage(raw);
		const current = connection.state as Cursor | null;
		if (!message || !current) return;

		let next: Cursor;
		if (message.type === 'move') next = { ...current, position: { x: message.x, y: message.y } };
		else if (message.type === 'leave') next = { ...current, position: undefined };
		else next = { ...current, message: message.message || undefined };

		connection.setState(next);
		this.broadcast(JSON.stringify({ type: 'update', id: connection.id, cursor: next } satisfies ServerMessage), [connection.id]);
	}

	onClose(connection: Connection) {
		this.#budget.delete(connection.id);
		this.broadcast(JSON.stringify({ type: 'remove', id: connection.id } satisfies ServerMessage), [connection.id]);
	}

	onError(connection: Connection) {
		this.onClose(connection);
	}

	#allow(id: string) {
		const second = Math.floor(Date.now() / 1000);
		const entry = this.#budget.get(id);
		if (!entry || entry.second !== second) {
			this.#budget.set(id, { second, count: 1 });
			return true;
		}
		entry.count += 1;
		return entry.count <= MESSAGES_PER_SECOND;
	}
}

function send(connection: Connection, message: ServerMessage) {
	connection.send(JSON.stringify(message));
}

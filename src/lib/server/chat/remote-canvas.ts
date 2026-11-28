/**
 * A table canvas that can't hold a socket to its thread: the table view inside Claude, an MCP
 * App in a sandboxed frame, which reaches the site only through tool calls its host relays.
 * So the view asks for its next change and waits (`next`), makes it, and reports back (`done`),
 * while the tool that wants the change waits here for the answer (`perform`).
 *
 * One view at a time takes changes: the one opened last. An older view of the same table is
 * told it has been replaced, so two canvases never save over each other.
 */
import { tableOpTimeout } from './canvas';
import type { TableOp, TableOpEvent, TableOpReply } from '../../table-agent';
import type { ViewTurn } from '../../table-view-link';

/** How long a view waits for a change before asking again. */
export const VIEW_WAIT = 15_000;
/** A view that hasn't asked for this long is gone (closed, scrolled away and frozen, offline). */
export const VIEW_GONE = VIEW_WAIT + 12_000;

/** How long after a table is shown its view is still expected to turn up, and how long a change waits for it. */
export const VIEW_EXPECTED = 30_000;
export const VIEW_OPENING = 6_000;

export const NO_VIEW = 'This table isn’t open on a canvas right now, so it can be read but not changed. Open it with table_open, then try again.';

export type { ViewTurn } from '../../table-view-link';

interface Pending { event: TableOpEvent; resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>; sent?: boolean }

export class RemoteCanvas {
	/** The view taking changes, and when it last asked. */
	private view: { id: string; seen: number } | undefined;
	private queue: Pending[] = [];
	private cancelled: string[] = [];
	private wake: (() => void) | undefined;
	private count = 0;

	constructor(private now: () => number = Date.now) {}

	/** Whether a view is there to take changes. */
	open(): boolean {
		return !!this.view && this.now() - this.view.seen < VIEW_GONE;
	}

	/** A table was just shown to someone (`table_open`): its view should attach within moments. */
	private expected: number | undefined;
	expect() { this.expected = this.now(); }

	/**
	 * Whether a view is there to take a change, waiting a little for one that was just opened: a
	 * model asks for its first change the moment `table_open` answers, before the view has loaded.
	 * A view that doesn't come (a client that draws none) is waited for once, not before every change.
	 */
	async ready(wait = VIEW_OPENING): Promise<boolean> {
		if (this.open()) return true;
		if (this.expected === undefined || this.now() - this.expected > VIEW_EXPECTED) return false;
		const until = Date.now() + wait;
		while (!this.open() && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 100));
		if (!this.open()) this.expected = undefined;
		return this.open();
	}

	/** Whether this view is the one whose saves count: the one taking changes, or any when none is. */
	holds(view: string): boolean {
		return !this.view || this.view.id === view;
	}

	/** The table was changed where it is saved, with no view open: a view left over from before must not save its older copy over that. */
	release() {
		this.view = { id: '', seen: 0 };
		this.wake?.();
	}

	/** A view opens (or opens again after a reload): from now on it is the one that takes changes. */
	attach(view: string) {
		this.view = { id: view, seen: this.now() };
		this.expected = undefined;
		// Whoever was waiting belongs to the view before: let it hear that it was replaced.
		this.wake?.();
	}

	/** A view asks for its next change, waiting up to `wait` ms for one. */
	async next(view: string, wait = VIEW_WAIT): Promise<ViewTurn> {
		// A thread that was put to sleep has forgotten its view; a replaced view stops asking, so whoever asks now is the one.
		this.view ??= { id: view, seen: this.now() };
		if (this.view.id !== view) return { replaced: true };
		this.view.seen = this.now();
		if (!this.queue.some((one) => !one.sent) && !this.cancelled.length && wait > 0) {
			await new Promise<void>((resolve) => {
				// An earlier ask from the same view lets go; there is one waiter at a time.
				this.wake?.();
				const done = () => { clearTimeout(timer); if (this.wake === done) this.wake = undefined; resolve(); };
				const timer = setTimeout(done, wait);
				this.wake = done;
			});
			if (this.view?.id !== view) return { replaced: true };
			this.view.seen = this.now();
		}
		const cancel = this.cancelled.splice(0);
		const waiting = this.queue.find((one) => !one.sent);
		if (waiting) waiting.sent = true;
		return { ...(waiting ? { op: waiting.event } : {}), ...(cancel.length ? { cancel } : {}) };
	}

	/** Ask the view for a change and wait for what it reports. */
	perform(op: TableOp): Promise<unknown> {
		if (!this.open()) return Promise.reject(new Error(NO_VIEW));
		const id = `v${++this.count}${Math.floor(this.now()).toString(36)}`;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.queue = this.queue.filter((one) => one.event.id !== id);
				// The view must not make it late.
				this.cancelled.push(id);
				this.wake?.();
				reject(new Error('The table’s canvas didn’t answer in time, so nothing was changed. If its view was closed, open it again with table_open.'));
			}, tableOpTimeout(op.op, false));
			this.queue.push({ event: { type: 'table:op', id, ...op } as TableOpEvent, resolve, reject, timer });
			this.wake?.();
		});
	}

	/** The view's report on a change it was given. */
	done(view: string, reply: Pick<TableOpReply, 'id'> & ({ ok: true; result: unknown } | { ok: false; error: string })) {
		if (this.view?.id !== view) return;
		this.view.seen = this.now();
		const waiting = this.queue.find((one) => one.event.id === reply.id);
		if (!waiting) return;
		this.queue = this.queue.filter((one) => one !== waiting);
		clearTimeout(waiting.timer);
		if (reply.ok) waiting.resolve(reply.result);
		else waiting.reject(new Error(String(reply.error).slice(0, 300)));
	}
}

/**
 * Which of Casey's open table pages takes the assistant's edits. A browser keeps every tab's
 * socket open, but a tab in the background is slowed down or frozen and may not answer, so the
 * page Casey is looking at goes first, then whichever they used last.
 */
export interface CanvasPage {
	/** The tab is in the background (`document.hidden`). */
	hidden?: boolean;
	/** When Casey last did something there: wrote, or brought it to the front. */
	active: number;
}

/** A background tab gets less time to answer before the next page is tried. */
export const TABLE_OP_TIMEOUT = 30_000;
export const HIDDEN_TABLE_OP_TIMEOUT = 12_000;
/** Drawing a PDF's pages means fetching it and drawing each one: that page gets longer. */
export const SLOW_TABLE_OP_TIMEOUT = 90_000;
/** How long a page has to answer an operation. */
export const tableOpTimeout = (op: string, hidden: boolean) => (hidden ? HIDDEN_TABLE_OP_TIMEOUT : op === 'add_pdf_pages' ? SLOW_TABLE_OP_TIMEOUT : TABLE_OP_TIMEOUT);

/** Best first: pages in front before pages in the background, the latest used first within each. */
export function canvasOrder<T>(pages: T[], of: (page: T) => CanvasPage): T[] {
	return pages.toSorted((a, b) => {
		const one = of(a), other = of(b);
		return Number(!!one.hidden) - Number(!!other.hidden) || other.active - one.active;
	});
}

/** What the assistant is told when no page answered, so it can say what Casey should do. */
export function unansweredTable(hidden: boolean): string {
	return hidden
		? 'The table is open in a background tab that isn’t answering, so nothing was changed. Ask Casey to bring the table’s tab to the front, then try again.'
		: 'The table didn’t answer in time, so nothing was changed. Ask Casey to check the table’s tab (reloading it helps), then try again.';
}

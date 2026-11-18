/**
 * Whether the /chat thread sidebar shows. `auto` (until someone toggles it) means open on
 * wide screens and closed on narrow ones, decided in CSS so the first paint is right.
 * A choice made on a wide screen is remembered in this browser.
 */
import { getContext, setContext } from 'svelte';

export type SidebarState = 'auto' | 'open' | 'closed';

const KEY = Symbol('chat-sidebar');
const STORAGE = 'chat-sidebar';
export const WIDE = '(min-width: 900px)';

export class ChatSidebarState {
	state = $state<SidebarState>('auto');

	constructor(initial: SidebarState = 'auto') { this.state = initial; }

	/** Whether the sidebar is showing now, resolving `auto` by the window's width. */
	get showing(): boolean {
		if (this.state !== 'auto') return this.state === 'open';
		return typeof matchMedia === 'undefined' || matchMedia(WIDE).matches;
	}

	toggle() { this.set(this.showing ? 'closed' : 'open'); }

	/** Closes on a narrow screen, where the sidebar covers the page (after following a link). */
	closeIfCovering() { if (typeof matchMedia !== 'undefined' && !matchMedia(WIDE).matches && this.state === 'open') this.state = 'auto'; }

	set(state: SidebarState) {
		this.state = state;
		try {
			if (typeof matchMedia !== 'undefined' && matchMedia(WIDE).matches) localStorage.setItem(STORAGE, state);
		} catch { /* private mode */ }
	}

	/** The wide-screen choice from last time; narrow screens always start closed. */
	restore() {
		try {
			const saved = localStorage.getItem(STORAGE);
			if (matchMedia(WIDE).matches && (saved === 'open' || saved === 'closed')) this.state = saved;
		} catch { /* private mode */ }
	}
}

export const provideChatSidebar = (sidebar: ChatSidebarState) => setContext(KEY, sidebar);
export const useChatSidebar = () => getContext<ChatSidebarState | undefined>(KEY);

import { afterNavigate, pushState } from '$app/navigation';
import { page } from '$app/state';
import { stackFromUrl, urlWithStack } from '$lib/wiki/stack';

/**
 * The panes open beside a wiki page, kept in the address (`?stack=`) so a stack can be shared, and
 * in history so Back closes the last pane opened. Call during component setup.
 */
export function wikiStackState() {
	// A prerendered page can't read its query on the server, so the stack is read once it loads.
	let fromAddress = $state<string[]>([]);
	afterNavigate(() => {
		fromAddress = stackFromUrl(new URL(location.href));
	});
	return {
		get stack(): string[] {
			return page.state.wikiStack ?? fromAddress;
		},
		change(next: string[]) {
			pushState(urlWithStack(new URL(location.href), next), { wikiStack: next });
		}
	};
}

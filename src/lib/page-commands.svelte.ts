import { untrack } from 'svelte';
import type { CommandOption } from '$lib/components/ui';

/** Commands a page adds to the site's command palette while it is shown. */
export interface PageCommands {
	label: string;
	items: CommandOption[];
	/** Runs one of `items`. Values starting `go:` are links the palette follows itself. */
	run?: (value: string) => unknown;
}

const registered = $state<{ entries: { key: symbol; commands: () => PageCommands[] }[] }>({ entries: [] });

/** The sections every mounted page has added, in mount order. */
export function pageCommands(): PageCommands[] {
	return registered.entries.flatMap((entry) => entry.commands());
}

/**
 * Adds a page's own sections to the command palette for as long as the calling
 * component is mounted. Call it in a component's script; `commands` can read state.
 */
export function usePageCommands(commands: () => PageCommands[]): void {
	$effect(() => {
		const key = Symbol();
		// Registering mustn't make this effect depend on the list it changes.
		untrack(() => registered.entries.push({ key, commands }));
		return () => untrack(() => {
			registered.entries = registered.entries.filter((entry) => entry.key !== key);
		});
	});
}

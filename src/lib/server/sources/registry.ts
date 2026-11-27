/**
 * The sources the site keeps a copy of. To add one, write a `SourcePlugin` in `plugins/` and list
 * it here: the sync, the index, the search and the chat's tools pick it up from this list.
 */
import { arena } from './plugins/arena';
import { raindrop } from './plugins/raindrop';
import { readwise } from './plugins/readwise';
import type { SourcePlugin } from './types';

export const SOURCE_PLUGINS: SourcePlugin[] = [readwise, raindrop, arena];

export const sourcePlugin = (id: string): SourcePlugin | undefined => SOURCE_PLUGINS.find((plugin) => plugin.id === id);
export const sourceName = (id: string): string => sourcePlugin(id)?.name ?? id;

import type { Block } from './tables';

/**
 * Casey's private Are.na blocks matching a query, for the signed-in owner (`/api/arena`). Anyone
 * else, or any failure, gets none: private blocks only ever come from the Worker, never the index.
 */
export const searchPrivateArena = (query: string, limit = 24, signal?: AbortSignal) => ownerBlocks('/api/arena', query, limit, signal);

/** Casey's Raindrop bookmarks matching a query, for the signed-in owner (`/api/raindrop`); none for anyone else. */
export const searchRaindrop = (query: string, limit = 24, signal?: AbortSignal) => ownerBlocks('/api/raindrop', query, limit, signal);

async function ownerBlocks(path: string, query: string, limit: number, signal?: AbortSignal): Promise<Block[]> {
	try {
		const response = await fetch(`${path}?q=${encodeURIComponent(query.trim())}&limit=${limit}`, { credentials: 'same-origin', signal });
		if (!response.ok) return [];
		return ((await response.json()) as { blocks?: Block[] }).blocks ?? [];
	} catch {
		return [];
	}
}

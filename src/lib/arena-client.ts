import type { Block } from './tables';

/**
 * Casey's private Are.na blocks matching a query, for the signed-in owner (`/api/arena`). Anyone
 * else, or any failure, gets none: private blocks only ever come from the Worker, never the index.
 */
export async function searchPrivateArena(query: string, limit = 24, signal?: AbortSignal): Promise<Block[]> {
	try {
		const response = await fetch(`/api/arena?q=${encodeURIComponent(query.trim())}&limit=${limit}`, { credentials: 'same-origin', signal });
		if (!response.ok) return [];
		return ((await response.json()) as { blocks?: Block[] }).blocks ?? [];
	} catch {
		return [];
	}
}

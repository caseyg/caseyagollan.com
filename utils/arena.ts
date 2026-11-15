/**
 * Casey's Are.na channels and blocks for the site search index (and so the tables Add menu and ⌘K,
 * which search the same index). The index is public, so it holds only what anyone can see on Are.na;
 * private blocks are searched by the Worker for the signed-in owner instead (`$lib/server/arena.ts`).
 *
 * The v3 API reads public content without a token, at 30 requests a minute; a whole profile is about
 * ten. `ARENA_TOKEN`, when the build has it, raises that limit; private items are still dropped here.
 */
import { arenaDocument, fetchArena, isPublicOwn, type ArenaDocument } from '../src/lib/arena';

export * from '../src/lib/arena';

export async function arenaDocuments(options: Parameters<typeof fetchArena>[0] = {}): Promise<ArenaDocument[]> {
	return (await fetchArena({ token: process.env.ARENA_TOKEN, ...options })).filter((item) => isPublicOwn(item)).map(arenaDocument);
}

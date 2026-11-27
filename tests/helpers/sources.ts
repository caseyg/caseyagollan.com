import { Database } from 'bun:sqlite';
import { SourceIndex, type Sql } from '../../src/lib/server/sources/index';
import type { SourceDocument } from '../../src/lib/server/sources/types';

/** An index in memory, on the same SQL the Durable Object runs. */
export function memoryIndex(): SourceIndex {
	const database = new Database(':memory:');
	const sql: Sql = { all: (query, ...params) => database.query(query).all(...(params as never[])) as never };
	const index = new SourceIndex(sql);
	index.migrate();
	return index;
}

export const document = (over: Partial<SourceDocument> & { id: string }): SourceDocument => ({
	source: 'readwise', kind: 'article', title: `Document ${over.id}`, url: `https://example.com/${over.id}`, tags: [], places: [], private: true, created: '2026-11-20T12:00:00.000Z', ...over
});

import { readFile, writeFile, rename } from 'node:fs/promises';
import { enrichLibraryMetadata, openLibraryClient, type CatalogBook } from './openlibrary-metadata';
import type { BookMetadata } from '../src/lib/library-metadata';

const path = 'static/library/metadata.json';
const saved: Record<string, BookMetadata> = JSON.parse(await readFile(path, 'utf8'));
const catalog: Record<string, CatalogBook> = JSON.parse(await readFile('utils/librarything_caseygollan.json', 'utf8'));
async function checkpoint() {
	await writeFile(`${path}.tmp`, JSON.stringify(saved, null, 2) + '\n');
	await rename(`${path}.tmp`, path);
}
try {
	await enrichLibraryMetadata(catalog, saved, process.argv.includes('--fetch') ? openLibraryClient() : undefined, new Date(), checkpoint);
} catch (error) {
	console.error(error);
	process.exitCode = 1;
}
console.log(`Saved ${Object.keys(saved).length} book records; ${Object.values(saved).filter(book => book.description).length} descriptions.`);

import metadata from '../../static/library/metadata.json';

export interface BookMetadata {
	description?: string;
	categories?: string[];
	sourceUrl?: string;
	openLibraryCheckedAt?: string;
	coverId?: number;
	coverCheckedAt?: string;
	coverDownloadCheckedAt?: string;
	coverUrl?: string;
	coverWidth?: number;
	coverHeight?: number;
}

/** Saved enrichment is shared by the sidebar and build-time search. */
export function libraryMetadata(bookid?: number): BookMetadata {
	return (metadata as Record<string, BookMetadata>)[String(bookid)] ?? {};
}

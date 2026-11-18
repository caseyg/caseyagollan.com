import type { Json, Properties } from './document';

/** A photo attached in frontmatter, as the editor shows it. */
export interface EditorPhoto { url: string; alt: string }
const record = (value: Json): value is { [key: string]: Json } => !!value && typeof value === 'object' && !Array.isArray(value);
/** Alt text is one line of plain text. */
export const altText = (value: string): string => value.replace(/\s+/g, ' ').trim();

/** Frontmatter photos are URLs, or objects with a url (or Micropub value) and alt text. */
export function editorPhotos(properties: Properties): EditorPhoto[] {
	return (properties.photo ?? []).map(photo => {
		if (typeof photo === 'string') return { url: photo, alt: '' };
		const url = record(photo) ? photo.url ?? photo.value : undefined;
		const alt = record(photo) ? photo.alt : undefined;
		return { url: typeof url === 'string' ? url : '', alt: typeof alt === 'string' ? alt : '' };
	});
}

/** The stored photos with new alt text, keeping each photo's own shape and fields. */
export function photosWithAlts(photos: Json[], alts: string[]): Json[] {
	return photos.map((photo, index): Json => {
		const alt = altText(alts[index] ?? '');
		if (typeof photo === 'string') return alt ? { url: photo, alt } : photo;
		return record(photo) ? { ...photo, alt } : photo;
	});
}


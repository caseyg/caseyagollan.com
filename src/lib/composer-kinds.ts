/** Post kinds offered by the on-site composer, mirroring Quill's interfaces. */
export const COMPOSER_KINDS = {
	note: { label: 'Note', hint: 'A short post, optionally with photos or a location.' },
	article: { label: 'Article', hint: 'A titled post with a summary and Markdown body.' },
	reply: { label: 'Reply', hint: 'Respond to a post elsewhere on the web.' },
	bookmark: { label: 'Bookmark', hint: 'Save a link with a title and comment.' },
	like: { label: 'Like', hint: 'Favorite a post by URL.' },
	repost: { label: 'Repost', hint: 'Share someone else’s post.' },
	rsvp: { label: 'RSVP', hint: 'Answer an event invitation.' },
	photo: { label: 'Photo', hint: 'One or more photos with alt text.' },
	video: { label: 'Video', hint: 'Upload a video.' },
	event: { label: 'Event', hint: 'An event with a start, end and venue.' },
	review: { label: 'Review', hint: 'Rate something from one to five stars.' },
	itinerary: { label: 'Itinerary', hint: 'Flights, trains and other trip legs.' },
	food: { label: 'Food', hint: 'Something you ate.' },
	drink: { label: 'Drink', hint: 'Something you drank.' }
} as const;
export type ComposerKind = keyof typeof COMPOSER_KINDS;
export const isComposerKind = (value: string): value is ComposerKind => Object.hasOwn(COMPOSER_KINDS, value);

/** One itinerary leg as typed into the form. */
export interface LegFields { 'transit-type': string; operator: string; number: string; origin: string; destination: string; departure: string; arrival: string }
/** Flat form values: what the composer renders, and what a draft stores. */
export interface ComposerFields {
	[key: string]: string | string[] | LegFields[] | undefined;
	content?: string; format?: string; name?: string; summary?: string; category?: string;
	'in-reply-to'?: string; 'bookmark-of'?: string; 'like-of'?: string; 'repost-of'?: string; rsvp?: string;
	start?: string; end?: string; location?: string; 'location-name'?: string;
	'item-name'?: string; 'item-url'?: string; rating?: string; 'food-name'?: string;
	slug?: string; published?: string;
	photo?: string[]; 'photo-alt'?: string[]; video?: string[]; 'syndicate-to'?: string[];
	legs?: LegFields[];
}
export const LEG_KEYS = ['transit-type', 'operator', 'number', 'origin', 'destination', 'departure', 'arrival'] as const;

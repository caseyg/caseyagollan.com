import type { IconName } from './components/ui/Icon.svelte';

/** Post kinds offered by the on-site composer, mirroring Quill's interfaces, grouped for the post-type menu. */
export const COMPOSER_KINDS = {
	note: { icon: 'note', label: 'Note', hint: 'A short post, optionally with photos or a location.', group: 'Write' },
	article: { icon: 'article', label: 'Article', hint: 'A titled post with a summary and Markdown body.', group: 'Write' },
	reply: { icon: 'reply', label: 'Reply', hint: 'Respond to a post elsewhere on the web.', group: 'Write' },
	quotation: { icon: 'quote', label: 'Quotation', hint: 'Quote a passage, with who said it and where.', group: 'Write' },
	issue: { icon: 'issue', label: 'Issue', hint: 'File an issue on a code repository.', group: 'Write' },
	bookmark: { icon: 'bookmark', label: 'Bookmark', hint: 'Save a link with a title and comment.', group: 'Share' },
	like: { icon: 'heart', label: 'Like', hint: 'Favorite a post by URL.', group: 'Share' },
	repost: { icon: 'repost', label: 'Repost', hint: 'Share someone else’s post.', group: 'Share' },
	rsvp: { icon: 'rsvp', label: 'RSVP', hint: 'Answer an event invitation.', group: 'Share' },
	collection: { icon: 'layers', label: 'Collection', hint: 'A titled list of links.', group: 'Share' },
	photo: { icon: 'image', label: 'Photo', hint: 'One or more photos with alt text.', group: 'Media' },
	video: { icon: 'video', label: 'Video', hint: 'Upload a video.', group: 'Media' },
	audio: { icon: 'mic', label: 'Audio', hint: 'Upload a recording or a song.', group: 'Media' },
	checkin: { icon: 'pin', label: 'Checkin', hint: 'Say where you are.', group: 'Places and plans' },
	venue: { icon: 'landmark', label: 'Venue', hint: 'A place worth knowing: its address and site.', group: 'Places and plans' },
	event: { icon: 'calendar', label: 'Event', hint: 'An event with a start, end and venue.', group: 'Places and plans' },
	itinerary: { icon: 'plane', label: 'Itinerary', hint: 'Flights, trains and other trip legs.', group: 'Places and plans' },
	read: { icon: 'book', label: 'Read', hint: 'A book or article you want to read, are reading or finished.', group: 'Log' },
	watch: { icon: 'tv', label: 'Watch', hint: 'A film, show or video you watched.', group: 'Log' },
	listen: { icon: 'headphones', label: 'Listen', hint: 'An album, song or podcast you listened to.', group: 'Log' },
	play: { icon: 'gamepad', label: 'Play', hint: 'A game you played.', group: 'Log' },
	jam: { icon: 'music', label: 'Jam', hint: 'The song stuck in your head.', group: 'Log' },
	review: { icon: 'star', label: 'Review', hint: 'Rate something from one to five stars.', group: 'Log' },
	food: { icon: 'food', label: 'Food', hint: 'Something you ate.', group: 'Log' },
	drink: { icon: 'drink', label: 'Drink', hint: 'Something you drank.', group: 'Log' },
	exercise: { icon: 'activity', label: 'Exercise', hint: 'A run, ride, swim or other workout.', group: 'Log' },
	recipe: { icon: 'recipe', label: 'Recipe', hint: 'Ingredients and steps for something you cook.', group: 'Log' }
} as const satisfies Record<string, { icon: IconName; label: string; hint: string; group: string }>;
/** Kinds that cite a work by name, author and URL, and what each calls the author. */
export const CITE_KINDS = { read: 'Author', watch: 'Director or channel', listen: 'Artist', play: 'Studio', jam: 'Artist' } as const;
export type CiteKind = keyof typeof CITE_KINDS;
export const isCiteKind = (value: string): value is CiteKind => Object.hasOwn(CITE_KINDS, value);
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
	quote?: string; 'cite-name'?: string; 'cite-author'?: string; 'cite-url'?: string; 'read-status'?: string;
	'venue-name'?: string; 'venue-url'?: string; 'street-address'?: string; locality?: string; region?: string; 'country-name'?: string;
	activity?: string; distance?: string; duration?: string; ingredients?: string; yield?: string;
	slug?: string; published?: string;
	photo?: string[]; 'photo-alt'?: string[]; video?: string[]; audio?: string[]; children?: string[]; 'syndicate-to'?: string[];
	legs?: LegFields[];
}
export const LEG_KEYS = ['transit-type', 'operator', 'number', 'origin', 'destination', 'departure', 'arrival'] as const;

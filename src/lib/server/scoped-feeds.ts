import { error } from '@sveltejs/kit';
import { getAllPosts, getAllTags, getPostsByTag, getPostsByType, POST_TYPE_PLURALS, POST_TYPES } from '$lib/posts';
import { tagFeedBase, typeFeedBase } from '$lib/feeds';
import { serializeAtom, serializeJsonFeed, serializeRss, type FeedOptions } from './feeds';
import type { Post } from '../posts-types';

export type FeedFormat = 'rss' | 'atom' | 'json';

const SERIALIZE = { rss: serializeRss, atom: serializeAtom, json: serializeJsonFeed };
const CONTENT_TYPE = {
	rss: 'application/rss+xml; charset=utf-8',
	atom: 'application/atom+xml; charset=utf-8',
	json: 'application/feed+json; charset=utf-8'
};

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** A type's singular name from either form in its address ("photos" or "photo"). */
export function singularType(param: string): string | undefined {
	const singular = Object.entries(POST_TYPE_PLURALS).find(([one, many]) => many === param || one === param)?.[0];
	return singular && (POST_TYPES as readonly string[]).includes(singular) ? singular : undefined;
}

/** Every post type and tag that has posts, for prerendering their feeds. */
export async function typeFeedEntries(): Promise<{ type: string }[]> {
	const types = new Set((await getAllPosts()).map((post) => post.type));
	return [...types].filter((type) => POST_TYPE_PLURALS[type]).map((type) => ({ type: POST_TYPE_PLURALS[type] }));
}

export async function tagFeedEntries(): Promise<{ tag: string }[]> {
	const tags = new Set([...getAllTags(await getAllPosts()).keys()].map((tag) => tag.toLowerCase()));
	return [...tags].map((tag) => ({ tag }));
}

function respond(format: FeedFormat, posts: Post[], options: FeedOptions): Response {
	return new Response(SERIALIZE[format](posts, 50, options), { headers: { 'Content-Type': CONTENT_TYPE[format] } });
}

/** One post type's feed, such as /type/photos/feed.xml. */
export async function typeFeed(param: string, format: FeedFormat): Promise<Response> {
	const type = singularType(param);
	if (!type) error(404, `Post type "${param}" not found`);
	const plural = POST_TYPE_PLURALS[type];
	const base = typeFeedBase(plural);
	return respond(format, getPostsByType(await getAllPosts(), type), {
		title: `Casey Gollan: ${capitalize(plural)}`,
		description: `${capitalize(plural)} by Casey Gollan`,
		home: base.slice(0, -1),
		base
	});
}

/** One tag's feed, such as /tags/indieweb/feed.xml. */
export async function tagFeed(tag: string, format: FeedFormat): Promise<Response> {
	const posts = getPostsByTag(await getAllPosts(), tag);
	if (!posts.length) error(404, `No posts found with tag "${tag}"`);
	const base = tagFeedBase(tag);
	return respond(format, posts, {
		title: `Casey Gollan: #${tag.toLowerCase()}`,
		description: `Posts tagged #${tag.toLowerCase()} by Casey Gollan`,
		home: base.slice(0, -1),
		base
	});
}

import { getPostsMenu } from '$lib/server/posts-menu';
import { getAllPosts, getPostsByType, getPostsByDay, POST_TYPES, POST_TYPE_PLURALS } from '$lib/posts';
import { error } from '@sveltejs/kit';
import { TYPE_ICONS, type PostType } from '$lib/posts-filter';
import type { PageServerLoad } from './$types';


export const load: PageServerLoad = async ({ params }) => {
	const { type } = params;

	// Validate type - accept both singular and plural forms
	const singularType = Object.entries(POST_TYPE_PLURALS).find(
		([singular, plural]) => plural === type || singular === type
	)?.[0];

	if (!singularType || !POST_TYPES.includes(singularType as typeof POST_TYPES[number])) {
		throw error(404, `Post type "${type}" not found`);
	}

	const allPosts = await getAllPosts();
	const posts = getPostsByType(allPosts, singularType);

	// Photos render as a gallery, which needs only each post's photos, date and address.
	const photos =
		singularType === 'photo'
			? posts.filter((post) => post.photo?.length).map(({ slug, date, photo }) => ({ slug, date, photo }))
			: undefined;

	const postsByDay = getPostsByDay(posts);
	const postsByDayArray = Array.from(postsByDay.entries()).sort((a, b) => b[0].localeCompare(a[0]));

	return {
		postsMenu: await getPostsMenu({ types: [singularType as PostType] }),
		type: singularType,
		typeIcon: TYPE_ICONS[singularType as keyof typeof TYPE_ICONS] || '📌',
		typePlural: POST_TYPE_PLURALS[singularType],
		postsByDay: photos ? [] : postsByDayArray,
		photos,
		totalPosts: photos ? photos.length : postsByDayArray.reduce((count, [, entries]) => count + entries.length, 0)
	};
};

import type { Meta, StoryObj } from '@storybook/sveltekit';
import PostTypeFilter from './PostTypeFilter.svelte';
import { localTypesHref, typeFilterOptions, type PostType } from '$lib/posts-filter';

const counts: [PostType, number][] = [['note', 73], ['article', 4], ['bookmark', 11], ['photo', 37], ['reply', 62], ['like', 772], ['repost', 155]];
const options = typeFilterOptions(counts.flatMap(([type, count]) => Array.from({ length: count }, () => [type])));
const available = options.map((option) => option.type);
const meta = {
	title: 'Posts/PostTypeFilter',
	component: PostTypeFilter,
	args: { options, selected: available, href: (types: PostType[]) => localTypesHref('/posts', types, available) }
} satisfies Meta<typeof PostTypeFilter>;
export default meta;
type Story = StoryObj<typeof meta>;
/** Collapsed behind the filter button until opened. */
export const AllShown: Story = {};
/** Opens automatically while a filter is active. */
export const LikesAndRepostsHidden: Story = { args: { selected: ['note', 'article', 'bookmark', 'photo', 'reply'] } };
export const NotesOnly: Story = { args: { selected: ['note'] } };

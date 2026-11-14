import type { Meta, StoryObj } from '@storybook/sveltekit';
import PostTypeFilter from './PostTypeFilter.svelte';
import type { TypeFilterOption } from '$lib/posts-filter';

const options: TypeFilterOption[] = [
	{ type: 'note', label: 'Notes', count: 73 },
	{ type: 'article', label: 'Articles', count: 4 },
	{ type: 'bookmark', label: 'Bookmarks', count: 11 },
	{ type: 'photo', label: 'Photos', count: 37 },
	{ type: 'reply', label: 'Replies', count: 62 },
	{ type: 'like', label: 'Likes', count: 772 },
	{ type: 'repost', label: 'Reposts', count: 155 }
];
const meta = {
	title: 'Posts/PostTypeFilter',
	component: PostTypeFilter,
	args: { options, selected: options.map((option) => option.type) }
} satisfies Meta<typeof PostTypeFilter>;
export default meta;
type Story = StoryObj<typeof meta>;
export const AllShown: Story = {};
export const LikesAndRepostsHidden: Story = { args: { selected: ['note', 'article', 'bookmark', 'photo', 'reply'] } };
export const NotesOnly: Story = { args: { selected: ['note'] } };

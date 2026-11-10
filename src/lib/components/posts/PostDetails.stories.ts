import type { Meta, StoryObj } from '@storybook/sveltekit';
import PostDetails from './PostDetails.svelte';
import { note, article, bookmark, reply, photo, reaction } from '$lib/storybook/fixtures';
const meta = { title: 'Posts/PostDetails', component: PostDetails, args: { post: bookmark } } satisfies Meta<typeof PostDetails>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Bookmark: Story = {};
export const Reply: Story = { args: { post: reply } };
export const Like: Story = { args: { post: reaction } };

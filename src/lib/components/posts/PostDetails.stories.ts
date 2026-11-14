import type { Meta, StoryObj } from '@storybook/sveltekit';
import PostDetails from './PostDetails.svelte';
import { reaction, repost } from '$lib/storybook/fixtures';
const meta = { title: 'Posts/PostDetails', component: PostDetails, args: { post: reaction } } satisfies Meta<typeof PostDetails>;
export default meta;
type Story = StoryObj<typeof meta>;
/** The saved copy of the post that was liked. Notes, replies and bookmarks have nothing extra to show, so this renders nothing for them. */
export const Like: Story = {};
export const Repost: Story = { args: { post: repost } };

import type { Meta, StoryObj } from '@storybook/sveltekit';
import PostTitle from './PostTitle.svelte';
import { article, bookmark } from '$lib/storybook/fixtures';

const meta = { title: 'Posts/PostTitle', component: PostTitle, args: { post: article } } satisfies Meta<typeof PostTitle>;
export default meta;
type Story = StoryObj<typeof meta>;
export const InFeed: Story = { args: { href: '/2026/01/10/storybook-note/' } };
export const OnPage: Story = { args: { context: 'page' } };
export const Bookmark: Story = { args: { post: bookmark } };
export const BookmarkOnPage: Story = { args: { post: bookmark, context: 'page' } };

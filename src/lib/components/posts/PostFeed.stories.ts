import type { Meta, StoryObj } from '@storybook/sveltekit';
import PostFeed from './PostFeed.svelte';
import { note, article, bookmark, photo } from '$lib/storybook/fixtures';

const meta = { title: 'Posts/PostFeed', component: PostFeed } satisfies Meta<typeof PostFeed>;
export default meta;
type Story = StoryObj<typeof meta>;
export const GroupedByDay: Story = { args: { postsByDay: [['2026-01-10', [note, { ...article, slug: 'article' }]], ['2026-01-08', [{ ...bookmark, slug: 'bookmark' }]]] } };
export const SingleDay: Story = { args: { posts: [note, { ...photo, slug: 'photo' }] } };
export const ActiveTag: Story = { args: { posts: [note], activeTag: 'design' } };

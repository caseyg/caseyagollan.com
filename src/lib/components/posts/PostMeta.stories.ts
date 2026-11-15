import type { Meta, StoryObj } from '@storybook/sveltekit';
import PostMeta from './PostMeta.svelte';
import { note, article, bookmark, reply, photo, reaction } from '$lib/storybook/fixtures';
const meta = { title: 'Posts/PostMeta', component: PostMeta, args: { type: 'note', date: note.date, permalink: '/2026/01/10/storybook-note/', category: note.category, syndication: note.syndication } } satisfies Meta<typeof PostMeta>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Article: Story = { args: { type: 'article' } };
export const WithoutInteractions: Story = { args: { showInteractions: false } };
/** The signed-in owner sees a pencil at the right edge of the row, leading to the editor. */
export const OwnerEdit: Story = {
	beforeEach: () => {
		localStorage.setItem('owner-signed-in', '1');
		return () => localStorage.removeItem('owner-signed-in');
	}
};

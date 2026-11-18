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
		const fetch = window.fetch;
		window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => String(input).endsWith('/auth/session') ? Promise.resolve(Response.json({ authenticated: true })) : fetch(input, init)) as typeof fetch;
		return () => { localStorage.removeItem('owner-signed-in'); window.fetch = fetch; };
	}
};
/** A syndicated thread saves every post's link; one mark per network shows, linking the first post. */
export const SyndicatedThread: Story = { args: { type: 'article', syndication: ['https://bsky.app/profile/caseyagollan.com/post/3mzoozs6d4tqh', 'https://bsky.app/profile/caseyagollan.com/post/3mzoozs6d4tqi', 'https://bsky.app/profile/caseyagollan.com/post/3mzoozs6d4tqj', 'https://social.coop/@caseyg/117572962830652076', 'https://social.coop/@caseyg/117572962830652077'] } };
/** People tagged in the post sit after its topic tags, each a `u-category h-card`. */
export const PersonTags: Story = { args: { people: [{ name: 'Aaron Parecki', url: 'https://aaronparecki.com/' }, { name: 'Tantek Çelik', url: 'https://tantek.com/' }] } };

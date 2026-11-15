import type { Meta, StoryObj } from '@storybook/sveltekit';
import PhotoTile from './PhotoTile.svelte';

const meta = {
	title: 'Posts/PhotoTile',
	component: PhotoTile,
	args: { photo: { url: '/sisu.gif', alt: 'Sisu, an animated illustration' }, href: '/2026/01/10/storybook-photo/', dateKey: '2026-01-10' },
	parameters: { layout: 'padded' }
} satisfies Meta<typeof PhotoTile>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Single: Story = {};
/** A post with several photos shows how many. */
export const Several: Story = { args: { count: 4 } };
/** Without alt text the link still names the photo by its date. */
export const NoAlt: Story = { args: { photo: { url: '/author-avatar.webp' } } };

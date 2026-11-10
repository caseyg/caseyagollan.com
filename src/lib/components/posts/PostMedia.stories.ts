import type { Meta, StoryObj } from '@storybook/sveltekit';
import PostMedia from './PostMedia.svelte';

const meta = { title: 'Posts/PostMedia', component: PostMedia, args: { photos: [{ url: '/sisu.gif', alt: 'An animated illustration of Sisu' }] } } satisfies Meta<typeof PostMedia>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Photo: Story = {};
export const Gallery: Story = { args: { photos: [{ url: '/sisu.gif', alt: 'Sisu' }, { url: '/author-avatar.webp', alt: 'Casey Gollan' }] } };
export const Empty: Story = { args: { photos: [] } };

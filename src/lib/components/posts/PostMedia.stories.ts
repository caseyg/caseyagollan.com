import type { Meta, StoryObj } from '@storybook/sveltekit';
import PostMedia from './PostMedia.svelte';

const meta = { title: 'Posts/PostMedia', component: PostMedia, args: { photos: [{ url: '/sisu.gif', alt: 'An animated illustration of Sisu' }] } } satisfies Meta<typeof PostMedia>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Photo: Story = {};
export const Gallery: Story = { args: { photos: [{ url: '/sisu.gif', alt: 'Sisu' }, { url: '/author-avatar.webp', alt: 'Casey Gollan' }] } };
/** An audio post: a player per file, captioned with its name when it has one. */
export const Audio: Story = { args: { photos: undefined, audio: [{ url: 'https://upload.wikimedia.org/wikipedia/commons/c/c8/Example.ogg', alt: 'Example recording', type: 'audio/ogg' }] } };

import type { Meta, StoryObj } from '@storybook/sveltekit';
import BookmarkTitle from './BookmarkTitle.svelte';

const meta = { title: 'Posts/BookmarkTitle', component: BookmarkTitle, args: { url: 'https://sfpc.study/', title: 'School for Poetic Computation' } } satisfies Meta<typeof BookmarkTitle>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const UrlOnly: Story = { args: { title: undefined } };

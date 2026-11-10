import type { Meta, StoryObj } from '@storybook/sveltekit';
import PostCategories from './PostCategories.svelte';

const meta = { title: 'Posts/PostCategories', component: PostCategories, args: { category: ['Design', 'Research', 'Creative technology'] } } satisfies Meta<typeof PostCategories>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Active: Story = { args: { activeTag: 'design' } };
export const Empty: Story = { args: { category: [] } };

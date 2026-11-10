import type { Meta, StoryObj } from '@storybook/sveltekit';
import Nav from './Nav.svelte';

const meta = { title: 'Site/Nav', component: Nav, args: { currentPage: 'home' } } satisfies Meta<typeof Nav>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Home: Story = {};
export const Library: Story = { args: { currentPage: 'library' } };
export const Posts: Story = { args: { currentPage: 'posts' } };

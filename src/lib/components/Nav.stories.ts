import type { Meta, StoryObj } from '@storybook/sveltekit';
import Nav from './Nav.svelte';

const meta = { title: 'Site/Nav', component: Nav, args: { currentPage: 'home' } } satisfies Meta<typeof Nav>;
export default meta;
type Story = StoryObj<typeof meta>;
/** Every tile is always present; the section being viewed is marked. */
export const Home: Story = {};
export const Library: Story = { args: { currentPage: 'library' } };
export const Posts: Story = { args: { currentPage: 'posts' } };
/** Pages outside the three sections, such as an error page, mark none. */
export const Elsewhere: Story = { args: { currentPage: undefined } };

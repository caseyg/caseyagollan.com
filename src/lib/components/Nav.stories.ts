import type { Meta, StoryObj } from '@storybook/sveltekit';
import Nav from './Nav.svelte';

const meta = { title: 'Site/Nav', component: Nav, args: { currentPage: 'home' } } satisfies Meta<typeof Nav>;
export default meta;
type Story = StoryObj<typeof meta>;
/** Every segment is always present; the section being viewed takes the full accent. */
export const Home: Story = {};
export const Library: Story = { args: { currentPage: 'library' } };
export const Posts: Story = { args: { currentPage: 'posts' } };
/** Pages outside the sections, such as an error page, mark none. */
export const Elsewhere: Story = { args: { currentPage: undefined } };
export const Wiki: Story = { args: { currentPage: 'wiki' } };
export const Tables: Story = { args: { currentPage: 'tables' } };
/**
 * Where a page's trail would be left too little room, as on a phone, the sections fold into one
 * menu named for the section being viewed, and Search stays at the end of the row.
 */
export const Condensed: Story = { args: { currentPage: 'wiki', condensed: true } };
/** Condensed on a page outside the sections, the menu is simply called Menu. */
export const CondensedElsewhere: Story = { args: { currentPage: undefined, condensed: true } };

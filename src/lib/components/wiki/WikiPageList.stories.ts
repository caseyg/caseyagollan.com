import Width from '$lib/storybook/Width.svelte';
import type { Meta, StoryObj } from '@storybook/sveltekit';
import WikiPageList from './WikiPageList.svelte';
import { sampleSummaries } from '$lib/storybook/wiki';

const meta = {
	title: 'Wiki/WikiPageList',
	component: WikiPageList,
	tags: ['autodocs'],
	args: { pages: sampleSummaries },
	decorators: [() => ({ Component: Width, props: { width: '38rem' } })]
} satisfies Meta<typeof WikiPageList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every page under its letter, like the index of a book. Type to filter, or pick a tag. */
export const Default: Story = {};

export const FilteredByTag: Story = { args: { tag: 'art' } };

export const NoTags: Story = { args: { pages: sampleSummaries.map((page) => ({ ...page, tags: [] })) } };

import type { Meta, StoryObj } from '@storybook/sveltekit';
import TagList from './TagList.svelte';

const meta = {
	title: 'Posts/TagList',
	component: TagList,
	tags: ['autodocs']
} satisfies Meta<typeof TagList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The page of all tags: every tag with its post count, most used first. */
export const Default: Story = {
	args: {
		tags: [
			{ name: 'design', href: '/tag/design/', count: 42 },
			{ name: 'research', href: '/tag/research/', count: 17 },
			{ name: 'indieweb', href: '/tag/indieweb/', count: 9 },
			{ name: 'libraries', href: '/tag/libraries/', count: 4 },
			{ name: 'maps', href: '/tag/maps/', count: 1 }
		]
	}
};

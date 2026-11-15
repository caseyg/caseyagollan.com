import type { Meta, StoryObj } from '@storybook/sveltekit';
import TagList from './TagList.svelte';

const meta = {
	title: 'Posts/TagList',
	component: TagList,
	tags: ['autodocs']
} satisfies Meta<typeof TagList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The page of all tags: an alphabetical cloud, where a tag used on more posts is larger. */
export const Default: Story = {
	args: {
		tags: [
			{ name: 'design', href: '/tags/design/', count: 42 },
			{ name: 'research', href: '/tags/research/', count: 17 },
			{ name: 'indieweb', href: '/tags/indieweb/', count: 9 },
			{ name: 'libraries', href: '/tags/libraries/', count: 4 },
			{ name: 'maps', href: '/tags/maps/', count: 1 }
		]
	}
};

import type { Meta, StoryObj } from '@storybook/sveltekit';
import SelectMenu from './SelectMenu.svelte';

const meta = {
	title: 'Primitives/SelectMenu',
	component: SelectMenu,
	parameters: { docs: { story: { height: '260px' } } },
	args: {
		current: 'Notes', currentIcon: '📝', count: 42,
		options: [
			{ value: 'notes', label: 'Notes', href: '/type/notes/', count: 42, icon: '📝' },
			{ value: 'articles', label: 'Articles', href: '/type/articles/', count: 12, icon: '📄' },
			{ value: 'bookmarks', label: 'Bookmarks', href: '/type/bookmarks/', count: 310, icon: '🔖' }
		]
	}
} satisfies Meta<typeof SelectMenu>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const TagMenu: Story = { args: { current: '#design', currentIcon: undefined, count: 18, options: [{ value: 'design', label: '#design', href: '/tags/design/', count: 18 }, { value: 'research', label: '#research', href: '/tags/research/', count: 9 }] } };
/** A low-emphasis trigger for a tool's own bar, such as the composer's post type. Its panel sits on the page's ground instead of the navigation's blue. */
export const Quiet: Story = { args: { variant: 'quiet', columns: 2, current: 'Notes', options: [...meta.args.options, { value: 'photos', label: 'Photos', href: '/type/photos/', icon: '📷' }] } };
/** The composer's post-type menu: grouped options in two columns, each group's heading across both. */
export const GroupedColumns: Story = {
	args: {
		variant: 'quiet', columns: 2, current: 'Note',
		options: [
			{ value: 'note', label: 'Note', href: '/new/note/', icon: '📝', group: 'Write' }, { value: 'article', label: 'Article', href: '/new/article/', icon: '📄', group: 'Write' }, { value: 'quotation', label: 'Quotation', href: '/new/quotation/', icon: '❝', group: 'Write' },
			{ value: 'photo', label: 'Photo', href: '/new/photo/', icon: '📷', group: 'Media' }, { value: 'audio', label: 'Audio', href: '/new/audio/', icon: '🎙', group: 'Media' },
			{ value: 'read', label: 'Read', href: '/new/read/', icon: '📖', group: 'Log' }, { value: 'watch', label: 'Watch', href: '/new/watch/', icon: '📺', group: 'Log' }, { value: 'listen', label: 'Listen', href: '/new/listen/', icon: '🎧', group: 'Log' }, { value: 'recipe', label: 'Recipe', href: '/new/recipe/', icon: '🥣', group: 'Log' }
		]
	}
};

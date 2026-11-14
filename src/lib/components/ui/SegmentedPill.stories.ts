import type { Meta, StoryObj } from '@storybook/sveltekit';
import SegmentedPill from './SegmentedPill.svelte';

const segments = [
	{ label: '2026', href: '/2026/' },
	{ label: '01', href: '/2026/01/' },
	{ label: '10', href: '/2026/01/10/' }
];
const meta = { title: 'Primitives/SegmentedPill', component: SegmentedPill, args: { segments, label: 'Date archive' } } satisfies Meta<typeof SegmentedPill>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Small: Story = {};
/** A page's trail: the section first, then the way down to the page being viewed. */
export const Trail: Story = {
	args: { size: 'md', label: undefined, segments: [{ label: 'Posts', href: '/posts/', icon: '📡' }, segments[0], { ...segments[1], current: true, count: 42 }] }
};
/** The last segment can switch between sibling pages. */
export const TrailWithMenu: Story = {
	args: {
		size: 'md',
		label: undefined,
		segments: [
			{ label: 'Posts', href: '/posts/', icon: '📡' },
			{ label: 'Notes', href: '', icon: '📝', count: 73, menu: [{ value: 'note', label: 'Notes', href: '/type/notes/', count: 73, icon: '📝' }, { value: 'article', label: 'Articles', href: '/type/articles/', count: 4, icon: '📄' }] }
		]
	}
};
/** Segments can be buttons that change the page in place. The choice in effect is pressed. */
export const ButtonGroup: Story = {
	args: {
		size: 'md',
		label: 'Library view',
		segments: [
			{ label: 'Graph', icon: '🕸️', pressed: true, onclick: () => {} },
			{ label: 'Shelves', icon: '📚', pressed: false, onclick: () => {} }
		]
	}
};
/** A lone button segment, such as the library's sort control, which steps through its options. */
export const SingleButton: Story = {
	args: { size: 'md', label: undefined, segments: [{ label: 'Recently acquired', icon: '📅', ariaLabel: 'Sorted by recently acquired. Sort by publication year', onclick: () => {} }] }
};
/** `compact` drops to emoji alone at phone width, as the site navigation does. Narrow the preview to see it. */
export const Compact: Story = {
	args: {
		size: 'md',
		label: 'Site',
		compact: true,
		segments: [
			{ label: 'Home', href: '/', icon: '👋', current: true },
			{ label: 'Library', href: '/library/', icon: '📚' },
			{ label: 'Posts', href: '/posts/', icon: '📡' }
		]
	}
};
export const LargeWithCurrent: Story = {
	args: { size: 'lg', segments: [segments[0], { ...segments[1], current: true, count: 42 }] }
};

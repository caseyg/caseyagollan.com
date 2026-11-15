import type { Meta, StoryObj } from '@storybook/sveltekit';
import SegmentedPill from './SegmentedPill.svelte';

const segments = [
	{ label: '2026', href: '/2026/' },
	{ label: '01', href: '/2026/01/' },
	{ label: '10', href: '/2026/01/10/' }
];
const meta = { title: 'Primitives/SegmentedPill', component: SegmentedPill, args: { segments, label: 'Date archive' }, parameters: { docs: { story: { height: '260px' } } } } satisfies Meta<typeof SegmentedPill>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Small: Story = {};
const postsMenu = [
	{ value: 'all', label: 'All posts', href: '/posts/', icon: '📡' },
	{ value: 'note', label: 'Notes', href: '/type/notes/', count: 73, icon: '📝', group: 'By type' },
	{ value: 'article', label: 'Articles', href: '/type/articles/', count: 4, icon: '📄', group: 'By type' },
	{ value: '2026', label: '2026', href: '/2026/', count: 212, group: 'By year' },
	{ value: '2025', label: '2025', href: '/2025/', count: 640, group: 'By year' }
];
/** A page's trail, in the quiet tone: the ground colour with a gray outline, so it reads as part of the page. */
export const Trail: Story = {
	args: { size: 'md', tone: 'quiet', compact: true, label: undefined, segments: [{ label: 'Posts', href: '/posts/', icon: '📡' }, segments[0], { ...segments[1], current: true, count: 42 }] }
};
/** The Posts segment opens a menu of the feed, each post type and each year. `menuActive` marks where you are. */
export const TrailWithMenu: Story = {
	args: {
		size: 'md',
		tone: 'quiet',
		compact: true,
		label: undefined,
		segments: [
			{ label: 'Posts', href: '/posts/', icon: '📡', menu: postsMenu, menuActive: 'note' },
			{ label: 'Notes', href: '', icon: '📝', count: 73, current: true }
		]
	}
};
/** The homepage's trail jumps to sections of the page. */
export const SectionMenu: Story = {
	args: {
		size: 'md',
		tone: 'quiet',
		compact: true,
		label: undefined,
		segments: [{ label: 'Casey Gollan', href: '#top', icon: '👋', current: true, menu: [
			{ value: 'top', label: 'Casey Gollan', href: '#top', icon: '👋' },
			{ value: 'currently', label: 'Currently', href: '#currently', icon: '📍' },
			{ value: 'exploring', label: 'Exploring', href: '#exploring', icon: '🧭' }
		] }]
	}
};
/** With a `value`, the pill picks one of its segments, like a radio group: one tab stop, arrow keys between choices, and a fill that slides to the choice. */
export const Choice: Story = {
	args: {
		size: 'md',
		label: 'Library view',
		value: 'graph',
		segments: [
			{ label: 'Graph', icon: '🕸️', value: 'graph' },
			{ label: 'Shelves', icon: '📚', value: 'shelves' }
		]
	}
};
/** A small choice, in the grays of in-page controls, such as a figure's placement in the editor. */
export const SmallChoice: Story = {
	args: {
		label: 'Placement',
		value: 'right',
		segments: [
			{ label: 'Full', value: 'full' },
			{ label: 'Right', value: 'right' },
			{ label: 'Narrow', value: 'narrow' }
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

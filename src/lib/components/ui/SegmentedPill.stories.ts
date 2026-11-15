import type { Meta, StoryObj } from '@storybook/sveltekit';
import SegmentedPill from './SegmentedPill.svelte';

const segments = [
	{ label: '2026', href: '/2026/' },
	{ label: '01', href: '/2026/01/' },
	{ label: '10', href: '/2026/01/10/' }
];
const meta = { title: 'Primitives/SegmentedPill', component: SegmentedPill, args: { segments, label: 'Date archive' }, parameters: { docs: { story: { height: '420px' } } } } satisfies Meta<typeof SegmentedPill>;
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
/**
 * In the posts section the menu's types, tags and years are check boxes that combine. Each count is what
 * the choice would show given the others, the menu stays open between choices, and `menuBadge` says what is in effect.
 */
export const TrailWithFacets: Story = {
	args: {
		size: 'md',
		tone: 'quiet',
		compact: true,
		label: undefined,
		segments: [{
			label: 'Posts', href: '/posts/', icon: '📡', current: true, menuBadge: 'Notes, 2026',
			menu: [
				postsMenu[0],
				{ value: 'note', label: 'Notes', href: '?years=2026', count: 31, icon: '📝', group: 'Type', checked: true },
				{ value: 'article', label: 'Articles', href: '?types=notes,articles&years=2026', count: 2, icon: '📄', group: 'Type', checked: false },
				{ value: 'tag:design', label: '#design', href: '?types=notes&tags=design&years=2026', count: 6, group: 'Tag', checked: false },
				{ value: 'tags', label: 'All tags', href: '/tags/', icon: '🏷️', group: 'Tag' },
				{ value: '2026', label: '2026', href: '?types=notes', count: 31, group: 'Year', checked: true },
				{ value: '2025', label: '2025', href: '?types=notes&years=2026,2025', count: 40, group: 'Year', checked: false }
			]
		}]
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
/** `compact: 'always'` shows emoji alone at every width, for a narrow panel such as the tables Add menu; hovering shows each label. */
export const CompactAlways: Story = {
	args: {
		size: 'sm',
		label: 'Show',
		compact: 'always',
		value: 'arena',
		segments: [
			{ label: 'All', value: 'all' },
			{ label: 'Posts', value: 'post', icon: '📡' },
			{ label: 'Books', value: 'book', icon: '📚' },
			{ label: 'Wiki', value: 'wiki', icon: '🌱' },
			{ label: 'Are.na', value: 'arena', icon: '✳️' },
			{ label: 'Raindrop', value: 'raindrop', icon: '💧' }
		]
	}
};
export const LargeWithCurrent: Story = {
	args: { size: 'lg', segments: [segments[0], { ...segments[1], current: true, count: 42 }] }
};

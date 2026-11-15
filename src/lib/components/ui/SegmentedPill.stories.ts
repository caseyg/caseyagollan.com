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
 * On a page that lists posts of several types, the types in the menu are check boxes that narrow the page
 * and can be combined. The menu stays open between choices, and `menuBadge` says what is in effect.
 */
export const TrailWithFilter: Story = {
	args: {
		size: 'md',
		tone: 'quiet',
		compact: true,
		label: undefined,
		segments: [{
			label: 'Posts', href: '/posts/', icon: '📡', current: true, menuBadge: 'Notes',
			menu: [
				postsMenu[0],
				{ value: 'note', label: 'Notes', href: '?types=notes', count: 73, icon: '📝', group: 'Filter by type', checked: true },
				{ value: 'article', label: 'Articles', href: '?types=notes,articles', count: 4, icon: '📄', group: 'Filter by type', checked: false },
				{ value: 'every-type', label: 'Show all types', href: '?', group: 'Filter by type' },
				{ value: 'tag:design', label: '#design', href: '/tag/design/', count: 42, group: 'By tag' },
				{ value: 'tags', label: 'All tags', href: '/tag/', count: 58, icon: '🏷️', group: 'By tag' },
				...postsMenu.slice(3)
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

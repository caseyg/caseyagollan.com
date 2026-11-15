import Width from '$lib/storybook/Width.svelte';
import type { Meta, StoryObj } from '@storybook/sveltekit';
import WikiToc from './WikiToc.svelte';

const meta = {
	title: 'Wiki/WikiToc',
	component: WikiToc,
	tags: ['autodocs'],
	decorators: [() => ({ Component: Width, props: { width: '17rem' } })]
} satisfies Meta<typeof WikiToc>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The page's outline. The section being read is marked as the page scrolls. */
export const Default: Story = {
	args: { headings: [{ id: 'interviews', text: 'Interviews', level: 2 }, { id: 'reading-list', text: 'Reading list', level: 2 }, { id: 'presentations', text: 'Presentations', level: 2 }] }
};

/** Two levels at most, the second indented; deeper headings are left out. */
export const Nested: Story = {
	args: {
		headings: [
			{ id: 'concepts', text: 'Concepts', level: 2 },
			{ id: 'governance', text: 'Governance', level: 3 },
			{ id: 'facilitation', text: 'Facilitation', level: 3 },
			{ id: 'notes', text: 'A detail too deep to list', level: 4 },
			{ id: 'reading', text: 'Reading', level: 2 }
		]
	}
};

/** A page with one heading or none has no outline. */
export const TooShort: Story = { args: { headings: [{ id: 'only', text: 'Only heading', level: 2 }] } };

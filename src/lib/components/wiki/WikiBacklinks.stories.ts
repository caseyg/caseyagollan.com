import Width from '$lib/storybook/Width.svelte';
import type { Meta, StoryObj } from '@storybook/sveltekit';
import WikiBacklinks from './WikiBacklinks.svelte';
import { sampleSummaries } from '$lib/storybook/wiki';

const meta = {
	title: 'Wiki/WikiBacklinks',
	component: WikiBacklinks,
	tags: ['autodocs'],
	args: { pages: sampleSummaries.slice(0, 3) },
	decorators: [() => ({ Component: Width, props: { width: '17rem' } })]
} satisfies Meta<typeof WikiBacklinks>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Pages that link here, each with the start of its text. */
export const Default: Story = {};

export const Empty: Story = { args: { pages: [] } };

export const LongExcerpts: Story = {
	args: { pages: [{ slug: 'now', title: 'Now', excerpt: 'This is a now page, inspired by Derek Sivers. August 2025. At work: building dashboards for a research team, writing about governance, and reading far too many annual reports from art schools.' }] }
};

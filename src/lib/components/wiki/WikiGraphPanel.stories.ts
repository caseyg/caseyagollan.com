import Width from '$lib/storybook/Width.svelte';
import type { Meta, StoryObj } from '@storybook/sveltekit';
import WikiGraphPanel from './WikiGraphPanel.svelte';
import { sampleLocalGraph, sampleWholeGraph } from '$lib/storybook/wiki';

const meta = {
	title: 'Wiki/WikiGraphPanel',
	component: WikiGraphPanel,
	tags: ['autodocs'],
	args: { layout: sampleLocalGraph, current: 'art-under-risk', moreHref: '/wiki/#graph' },
	decorators: [() => ({ Component: Width, props: { width: '17rem' } })]
} satisfies Meta<typeof WikiGraphPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Beside a page: its neighbourhood, with a way to the whole graph. */
export const Local: Story = {};

/** On the wiki's home page. */
export const Whole: Story = { args: { layout: sampleWholeGraph, current: undefined, moreHref: undefined, title: 'Graph' } };

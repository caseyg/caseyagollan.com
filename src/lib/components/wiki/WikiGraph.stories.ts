import Width from '$lib/storybook/Width.svelte';
import type { Meta, StoryObj } from '@storybook/sveltekit';
import WikiGraph from './WikiGraph.svelte';
import { layoutGraph } from '$lib/wiki/graph-layout';
import { sampleLocalGraph, sampleWholeGraph } from '$lib/storybook/wiki';

const meta = {
	title: 'Wiki/WikiGraph',
	component: WikiGraph,
	tags: ['autodocs'],
	args: { layout: sampleWholeGraph },
	decorators: [() => ({ Component: Width, props: { width: '36rem' } })]
} satisfies Meta<typeof WikiGraph>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The whole wiki. Hubs are named; pointing at a page names the pages it links to and from. */
export const Whole: Story = {};

/** One page and its neighbours, as it sits beside the page. The page being read is blue. */
export const Local: Story = { args: { layout: sampleLocalGraph, current: 'art-under-risk' } };

export const AllLabels: Story = { args: { layout: sampleLocalGraph, current: 'art-under-risk', labels: 'all' } };

/** A page nothing links to, and that links nowhere. */
export const Alone: Story = { args: { layout: layoutGraph({ nodes: [{ slug: 'now', title: 'Now', degree: 0 }], links: [] }), current: 'now', labels: 'all' } };

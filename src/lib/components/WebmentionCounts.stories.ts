import type { Meta, StoryObj } from '@storybook/sveltekit';
import WebmentionCounts from './WebmentionCounts.svelte';

const meta = { title: 'Site/WebmentionCounts', component: WebmentionCounts, args: { url: '/2026/01/10/storybook-note/' } } satisfies Meta<typeof WebmentionCounts>;
export default meta;
type Story = StoryObj<typeof meta>;
export const WithInteractions: Story = {};

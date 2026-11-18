import type { Meta, StoryObj } from '@storybook/sveltekit';
import WebmentionCounts from './WebmentionCounts.svelte';

const meta = { title: 'Site/WebmentionCounts', component: WebmentionCounts, args: { url: '/2026/01/10/storybook-note/' } } satisfies Meta<typeof WebmentionCounts>;
export default meta;
type Story = StoryObj<typeof meta>;
export const WithInteractions: Story = { args: { counts: { like: 3, repost: 1, reply: 2 } } };
export const LikesOnly: Story = { args: { counts: { like: 1, repost: 0, reply: 0 } } };
/** A post nobody has mentioned shows no chip. */
export const None: Story = { args: { counts: { like: 0, repost: 0, reply: 0 } } };

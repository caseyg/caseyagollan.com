import type { Meta, StoryObj } from '@storybook/sveltekit';
import InsightCard from './InsightCard.svelte';

const meta = { title: 'Site/InsightCard', component: InsightCard, args: { topic: 'Research', insight: 'Research creates room to ask better questions.' } } satisfies Meta<typeof InsightCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Active: Story = { args: { active: true } };
export const Streaming: Story = { args: { insight: '', isStreaming: true } };
export const Empty: Story = { args: { insight: '' } };

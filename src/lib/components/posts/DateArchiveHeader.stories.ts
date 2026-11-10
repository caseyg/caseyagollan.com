import type { Meta, StoryObj } from '@storybook/sveltekit';
import DateArchiveHeader from './DateArchiveHeader.svelte';

const meta = { title: 'Posts/DateArchiveHeader', component: DateArchiveHeader, args: { year: '2026', count: 42 } } satisfies Meta<typeof DateArchiveHeader>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Year: Story = {};
export const Month: Story = { args: { month: '01' } };
export const Day: Story = { args: { month: '01', day: '10' } };

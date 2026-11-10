import type { Meta, StoryObj } from '@storybook/sveltekit';
import DateHeader from './DateHeader.svelte';

const meta = { title: 'Posts/DateHeader', component: DateHeader, args: { dateKey: '2026-01-10' } } satisfies Meta<typeof DateHeader>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};

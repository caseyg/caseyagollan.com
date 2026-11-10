import type { Meta, StoryObj } from '@storybook/sveltekit';
import Search from './Search.svelte';

const meta = { title: 'Site/Search', component: Search, args: {} } satisfies Meta<typeof Search>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};

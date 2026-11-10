import type { Meta, StoryObj } from '@storybook/sveltekit';
import ArchiveHeader from './ArchiveHeader.svelte';

const meta = { title: 'Posts/ArchiveHeader', component: ArchiveHeader, args: { title: 'All Posts', count: 128 } } satisfies Meta<typeof ArchiveHeader>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Tag: Story = { args: { title: 'Design', count: 24 } };

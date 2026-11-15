import type { Meta, StoryObj } from '@storybook/sveltekit';
import DropdownArchiveHeader from './DropdownArchiveHeader.svelte';

const meta = { title: 'Posts/DropdownArchiveHeader', component: DropdownArchiveHeader, args: { current: '#design', count: 24, options: [{ value: 'design', label: '#design', href: '/tags/design/', count: 24 }, { value: 'research', label: '#research', href: '/tags/research/', count: 12 }, { value: 'indieweb', label: '#indieweb', href: '/tags/indieweb/', count: 7 }] }, parameters: { docs: { story: { height: '220px' } } } } satisfies Meta<typeof DropdownArchiveHeader>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};

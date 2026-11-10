import type { Meta, StoryObj } from '@storybook/sveltekit';
import DropdownArchiveHeader from './DropdownArchiveHeader.svelte';

const meta = { title: 'Posts/DropdownArchiveHeader', component: DropdownArchiveHeader, args: { current: 'All Posts', count: 128, options: [{ value: 'all', label: 'All Posts', href: '/posts/' }, { value: 'notes', label: 'Notes', href: '/type/note/', count: 42, icon: '📝' }, { value: 'articles', label: 'Articles', href: '/type/article/', count: 12, icon: '📄' }] } } satisfies Meta<typeof DropdownArchiveHeader>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};

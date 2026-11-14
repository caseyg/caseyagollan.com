import type { Meta, StoryObj } from '@storybook/sveltekit';
import MarkdownEditor from './MarkdownEditor.svelte';
const meta = { title: 'Components/MarkdownEditor', component: MarkdownEditor, args: { label: 'Content', value: '## Heading\n\nA paragraph with **bold**, *italic* and a [link](https://example.com/).\n\n- One\n- Two\n\n> A quote' } } satisfies Meta<typeof MarkdownEditor>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Empty: Story = { args: { value: '' } };

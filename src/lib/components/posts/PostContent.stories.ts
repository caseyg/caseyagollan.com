import type { Meta, StoryObj } from '@storybook/sveltekit';
import PostContent from './PostContent.svelte';

const meta = { title: 'Posts/PostContent', component: PostContent, args: { content: '## A heading\n\nA paragraph with **bold**, *italic*, and a [link](https://example.com).\n\n- One idea\n- Another idea\n\n> A quotation' } } satisfies Meta<typeof PostContent>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Markdown: Story = {};
export const PlainText: Story = { args: { format: 'text', content: 'Plain text with <angle brackets> & symbols.' } };
export const Html: Story = { args: { format: 'html', content: '<p>Some <strong>HTML</strong> content.</p>' } };

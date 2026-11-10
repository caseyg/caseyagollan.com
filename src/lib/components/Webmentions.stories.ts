import type { Meta, StoryObj } from '@storybook/sveltekit';
import Webmentions from './Webmentions.svelte';

const meta = { title: 'Site/Webmentions', component: Webmentions, args: { url: '/2026/01/10/storybook-note/' } } satisfies Meta<typeof Webmentions>;
export default meta;
type Story = StoryObj<typeof meta>;
export const WithInteractions: Story = {};

import type { Meta, StoryObj } from '@storybook/sveltekit';
import Foundations from '$lib/storybook/Foundations.svelte';

const meta = { title: 'Foundations/Tokens', component: Foundations, tags: ['!autodocs'] } satisfies Meta<typeof Foundations>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Color: Story = { args: { section: 'color' } };
export const Type: Story = { args: { section: 'type' } };
export const SpaceAndShape: Story = { args: { section: 'space' } };

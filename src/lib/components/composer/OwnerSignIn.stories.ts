import type { Meta, StoryObj } from '@storybook/sveltekit';
import OwnerSignIn from './OwnerSignIn.svelte';
const meta = { title: 'Components/OwnerSignIn', component: OwnerSignIn, args: { message: 'Sign in to post.' } } satisfies Meta<typeof OwnerSignIn>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};

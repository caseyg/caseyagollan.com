import type { Meta, StoryObj } from '@storybook/sveltekit';
import OwnerSignIn from './OwnerSignIn.svelte';
const meta = { title: 'Components/OwnerSignIn', component: OwnerSignIn, args: { message: 'Sign in to post.' } } satisfies Meta<typeof OwnerSignIn>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
/** On a branch preview: sign in through production's passkey instead. */
export const Preview: Story = { args: { message: 'Sign in to edit this post.', signInWith: 'https://caseyagollan.com/' } };

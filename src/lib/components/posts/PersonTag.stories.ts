import type { Meta, StoryObj } from '@storybook/sveltekit';
import PersonTag from './PersonTag.svelte';
const meta = { title: 'Posts/PersonTag', component: PersonTag, args: { person: { name: 'Aaron Parecki', url: 'https://aaronparecki.com/' } } } satisfies Meta<typeof PersonTag>;
export default meta;
type Story = StoryObj<typeof meta>;
/** A person tag from `q=contact`: the chip is a `u-category h-card` linking their profile. */
export const Default: Story = {};
/** A card with a photo shows it inline, in place of the @. */
export const WithPhoto: Story = { args: { person: { name: 'Casey Gollan', url: 'https://caseyagollan.com/', photo: '/author-avatar.webp' } } };
/** A bare profile URL tag reads as its host and path. */
export const ProfileUrl: Story = { args: { person: { name: 'social.coop/@caseyg', url: 'https://social.coop/@caseyg' } } };

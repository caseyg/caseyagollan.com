import type { Meta, StoryObj } from '@storybook/sveltekit';
import HCard from './HCard.svelte';
import { SITE_IDENTITY } from '$lib/identity';

const meta = { title: 'Site/HCard', component: HCard, args: { variant: 'profile' } } satisfies Meta<typeof HCard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The homepage's representative h-card, with its rel=me profile links. */
export const Profile: Story = {};

/** A long note and many profiles wrap onto more lines; a missing photo shows the surface color. */
export const LongContent: Story = {
	args: {
		identity: {
			...SITE_IDENTITY,
			photo: '',
			note: `${SITE_IDENTITY.note} ${SITE_IDENTITY.note}`,
			profiles: [...SITE_IDENTITY.profiles, { label: 'Are.na', href: 'https://www.are.na/casey-gollan' }, { label: 'Raindrop', href: 'https://raindrop.io/' }, { label: 'LibraryThing', href: 'https://www.librarything.com/' }]
		}
	}
};

/** The hidden p-author h-card each post carries; it renders nothing visible. */
export const Author: Story = { args: { variant: 'author' } };

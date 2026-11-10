import type { Meta, StoryObj } from '@storybook/sveltekit';
import NoteCard from './NoteCard.svelte';
import { note, article, bookmark, reply, photo, reaction } from '$lib/storybook/fixtures';
const meta = { title: 'Posts/NoteCard', component: NoteCard, args: { post: note } } satisfies Meta<typeof NoteCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Reply: Story = { args: { post: reply } };
export const Photo: Story = { args: { post: photo } };

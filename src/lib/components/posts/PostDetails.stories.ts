import type { Meta, StoryObj } from '@storybook/sveltekit';
import PostDetails from './PostDetails.svelte';
import { postTypeExamples as examples, reaction, repost } from '$lib/storybook/fixtures';
const meta = { title: 'Posts/PostDetails', component: PostDetails, args: { post: reaction } } satisfies Meta<typeof PostDetails>;
export default meta;
type Story = StoryObj<typeof meta>;
/** The saved copy of the post that was liked. Notes, replies and bookmarks have nothing extra to show, so this renders nothing for them. */
export const Like: Story = {};
export const Repost: Story = { args: { post: repost } };
export const Quotation: Story = { args: { post: examples.quotation } };
export const RSVP: Story = { args: { post: examples.rsvp } };
export const Checkin: Story = { args: { post: examples.checkin } };
/** A venue is an h-card post: its address, site, coordinates and note. */
export const Venue: Story = { args: { post: examples.venue } };
/** Reads say where Casey is in the book: want to read, started or finished. */
export const Read: Story = { args: { post: examples.read } };
export const Watch: Story = { args: { post: examples.watch } };
export const Listen: Story = { args: { post: examples.listen } };
export const Play: Story = { args: { post: examples.play } };
export const Jam: Story = { args: { post: examples.jam } };
export const Collection: Story = { args: { post: examples.collection } };
export const Issue: Story = { args: { post: examples.issue } };
export const Exercise: Story = { args: { post: examples.exercise } };
export const Recipe: Story = { args: { post: examples.recipe } };

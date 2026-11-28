import type { Meta, StoryObj } from '@storybook/sveltekit';
import TableToolbar from './TableToolbar.svelte';

const meta = { title: 'Tables/TableToolbar', component: TableToolbar, args: { editable: true, tool: 'select', canUndo: true, canRedo: false, status: 'Saved' } } satisfies Meta<typeof TableToolbar>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Owner: Story = { args: { published: true, onpublish: () => {} } };
/** A new table is a draft until it's published; only the owner sees it. */
export const Draft: Story = { args: { published: false, onpublish: () => {} } };
/** Blocks selected: Details shows or hides their source line and kind tile, for everyone. */
export const BlocksSelected: Story = { args: { published: true, onpublish: () => {}, details: 'shown', ondetails: () => {} } };
export const DetailsHidden: Story = { args: { published: true, onpublish: () => {}, details: 'hidden', ondetails: () => {} } };
export const PickerOpen: Story = { args: { adding: true, tool: 'note' } };
export const Saving: Story = { args: { status: 'Saving…', tool: 'draw' } };
export const SaveFailed: Story = { args: { status: 'Couldn’t save' } };
/** The owner's voice note: a microphone that writes what is said onto the table, with its choices behind the chevron. */
export const VoiceNote: Story = { args: { published: true, onpublish: () => {}, voice: { status: 'off', correct: true, arrange: false }, onvoice: () => {} } };
export const VoiceNoteListening: Story = { args: { published: true, onpublish: () => {}, voice: { status: 'listening', level: 0.6, correct: true, arrange: true }, onvoice: () => {} } };
/** Visitors can only fit the view; they pan and zoom on the canvas itself. */
export const Visitor: Story = { args: { editable: false, status: undefined } };

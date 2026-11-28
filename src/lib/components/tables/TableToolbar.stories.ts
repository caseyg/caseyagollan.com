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
/** Post starts a draft post with the table in it: embedded live, or as a picture. */
export const WithPost: Story = { args: { published: true, onpublish: () => {}, onpost: () => {} } };
export const Posting: Story = { args: { published: true, onpublish: () => {}, onpost: () => {}, posting: true, status: 'Making the post…' } };
export const PickerOpen: Story = { args: { adding: true, tool: 'note' } };
export const Saving: Story = { args: { status: 'Saving…', tool: 'draw' } };
export const SaveFailed: Story = { args: { status: 'Couldn’t save' } };
/** The owner's voice note: a microphone that writes what is said onto the table, with its choices behind the chevron. */
export const VoiceNote: Story = { args: { published: true, onpublish: () => {}, voice: { status: 'off', correct: true, arrange: false }, onvoice: () => {} } };
export const VoiceNoteListening: Story = { args: { published: true, onpublish: () => {}, voice: { status: 'listening', level: 0.6, correct: true, arrange: true }, onvoice: () => {} } };
/** Visitors can only fit the view; they pan and zoom on the canvas itself. */
export const Visitor: Story = { args: { editable: false, status: undefined } };
/**
 * Layout sets the whole table out again: tidied, in rows and columns, following its arrows, or in
 * groups. Its switch, Auto layout, keeps the table that way as things are added. More (the shapes
 * button) holds the rest of tldraw's tools: areas, pictures, shapes, lines, the highlighter and the laser.
 */
export const WithLayout: Story = { args: { published: true, onpublish: () => {}, onlayout: () => {}, onautolayout: () => {}, onmedia: () => {} }, parameters: { docs: { story: { height: '560px' } } } };
/** With things selected, Layout asks what to set out: the selection (the default) or the whole table. */
export const LayoutOfSelection: Story = { args: { ...WithLayout.args, selection: [{ id: 'a', type: 'post' }, { id: 'b', type: 'note' }, { id: 'c', type: 'book' }], details: 'shown', ondetails: () => {} }, parameters: WithLayout.parameters };
/** Auto layout on: the Layout button stays lit, and the layout being kept is checked. */
export const AutoLayoutOn: Story = { args: { ...WithLayout.args, autoLayout: 'tree' }, parameters: WithLayout.parameters };
/** A tool from More in hand: its icon takes the More button's place. */
export const MoreToolInHand: Story = { args: { ...WithLayout.args, tool: 'geo', geo: 'ellipse' }, parameters: WithLayout.parameters };

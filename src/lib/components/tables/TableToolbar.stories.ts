import type { Meta, StoryObj } from '@storybook/sveltekit';
import TableToolbar from './TableToolbar.svelte';

const meta = { title: 'Tables/TableToolbar', component: TableToolbar, args: { editable: true, tool: 'select', canUndo: true, canRedo: false, status: 'Saved' } } satisfies Meta<typeof TableToolbar>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Owner: Story = {};
export const PickerOpen: Story = { args: { adding: true, tool: 'note' } };
export const Saving: Story = { args: { status: 'Saving…', tool: 'draw' } };
export const SaveFailed: Story = { args: { status: 'Couldn’t save' } };
/** Visitors can only fit the view; they pan and zoom on the canvas itself. */
export const Visitor: Story = { args: { editable: false, status: undefined } };

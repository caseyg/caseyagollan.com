import type { Meta, StoryObj } from '@storybook/sveltekit';
import PersistentDocument from './PersistentDocument.svelte';

const meta = { title: 'Site/PersistentDocument', component: PersistentDocument, args: { content: 'Casey works at the intersection of research, operations, and creative technology.' } } satisfies Meta<typeof PersistentDocument>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Updating: Story = { args: { isUpdating: true } };
export const AnimatedEdit: Story = { args: { editEvent: { old_text: 'creative technology', new_text: 'poetic computation' } } };

import type { Meta, StoryObj } from '@storybook/sveltekit';
import SkillsGraph from './SkillsGraph.svelte';

const meta = { title: 'Site/SkillsGraph', component: SkillsGraph, args: {} } satisfies Meta<typeof SkillsGraph>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Focused: Story = { args: { focusNodeId: 'Research' } };

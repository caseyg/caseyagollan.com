import type { Segment } from '../ui';

export { default as BlockCard } from './BlockCard.svelte';
export { default as BlockPicker } from './BlockPicker.svelte';
export { default as TableCanvas, BLOCK_DRAG_TYPE } from './TableCanvas.svelte';
export { default as TableCard } from './TableCard.svelte';
export { default as TableGrid } from './TableGrid.svelte';
export { default as RenameTable } from './RenameTable.svelte';
export { default as TableToolbar } from './TableToolbar.svelte';
export type { TableApi, TableState } from './canvas/TableEditor';

/** The first segment of every trail in the tables section. */
export const TABLES_CRUMB: Segment = { label: 'Tables', href: '/tables/', icon: '🗂️' };

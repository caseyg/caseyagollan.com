import type { Segment } from '../ui';

export { default as ArenaBlock } from './ArenaBlock.svelte';
export { default as BlockCard } from './BlockCard.svelte';
export { default as SocialBlock } from './SocialBlock.svelte';
export { default as BlockFeed } from './BlockFeed.svelte';
export { default as BlockList } from './BlockList.svelte';
export { default as BlockPicker } from './BlockPicker.svelte';
export { default as TableAppView } from './TableAppView.svelte';
export { default as TableCanvas, BLOCK_DRAG_TYPE } from './TableCanvas.svelte';
export { default as TableCard } from './TableCard.svelte';
export { default as TableGrid } from './TableGrid.svelte';
export { default as RenameTable } from './RenameTable.svelte';
export { default as TableToolbar } from './TableToolbar.svelte';
export { default as TableWireframe } from './TableWireframe.svelte';
export { default as TableBlock } from './TableBlock.svelte';
export { default as TagDock } from './TagDock.svelte';
export { default as VoiceControl, type VoiceView } from './VoiceControl.svelte';
export type { TableApi, TableState, TaggableBlock } from './canvas/TableEditor';

/** The first segment of every trail in the tables section. */
export const TABLES_CRUMB: Segment = { label: 'Tables', href: '/tables/', icon: '🗂️' };

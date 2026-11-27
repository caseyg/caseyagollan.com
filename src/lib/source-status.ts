/** Where one source's copy on the site stands, as `/api/sources` tells the owner's settings. */
export interface SourceStatus {
	source: string;
	name: string;
	icon: string;
	/** Its token is saved with the site (Are.na's public side needs none). */
	configured: boolean;
	documents: number;
	private: number;
	highlights: number;
	withText: number;
	/** ISO time of the newest thing saved. */
	newest?: string;
	/** ISO time the last pass finished. */
	synced?: string;
	/** A pass is under way. */
	syncing: boolean;
	/** A first whole pass has finished. */
	everything: boolean;
}

export interface SourcesState { available: boolean; sources: SourceStatus[]; error?: string }

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
	/** Documents whose likeness has been worked out. */
	embedded?: number;
	/** How far the pass under way has got: the part being copied, and the whole pass as a fraction from 0 to 1. */
	progress?: { label: string; fraction: number; done?: number; total?: number };
	/** The service asked the sync to wait until this ISO time (a rate limit). */
	waiting?: string;
}

/** How far reading the words in stored pictures has got, as `/api/sources?pictures` tells the owner's settings. */
export interface PictureReading {
	/** Pictures in the copy, each address once. */
	total: number;
	read: number;
	withWords: number;
	/** Pictures that couldn't be fetched or read. */
	failed: number;
	/** How many more the owner asked to have read; above 0 while a pass is under way. */
	asked: number;
	/** What the reading has used, as the model counts it. */
	usage: { pictures: number; input: number; output: number };
	/** The latest read, newest first, to judge the reading by. */
	recent: { url: string; text: string; at: string; failed: boolean }[];
}

export interface SourcesState { available: boolean; sources: SourceStatus[]; error?: string }

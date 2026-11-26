// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
/// <reference types="@cloudflare/workers-types" />
import type { PublishingEnvironment } from './lib/server/publishing/config';
import type { RateLimitEnvironment } from './lib/server/rate-limit';

declare global {
	const __MICROPUB_ENDPOINT__: string;
	/** The tldraw key for branch previews; empty in production builds. See src/lib/tldraw-license.ts. */
	const __TLDRAW_PREVIEW_LICENSE_KEY__: string;
	const __INDIEAUTH_ISSUER__: string;
	interface Window {
		telescopicText?: { createTelescopicTextFromBulletedList: (content: string) => HTMLElement };
		createTelescopicTextFromBulletedList: (content: string) => HTMLElement;
	}
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		interface PageState {
			/** Wiki pages open as panes beside the one being read; see `WikiStack`. */
			wikiStack?: string[];
		}
		interface Platform {
			env?: PublishingEnvironment & RateLimitEnvironment & {
				INSIGHT_CACHE: KVNamespace;
				SCREENSHOTS?: R2Bucket;
				CLOUDFLARE_ACCOUNT_ID?: string;
				CLOUDFLARE_API_TOKEN?: string;
				GITHUB_CONTENT_TOKEN?: string;
				INFERENCE_COOP_API_KEY: string;
				/** /chat threads, one Agents SDK agent each (`src/lib/server/chat/agent.ts`). */
				ChatThread?: DurableObjectNamespace;
				/** The inference.coop model /chat answers with. */
				CHAT_MODEL?: string;
				CHAT_REASONING_EFFORT?: string;
				CHAT_MONTHLY_BUDGET?: string;
				KAGI_API_KEY: string;
				/** Are.na personal access token; reads Casey’s private blocks for the owner only. */
				ARENA_PAT?: string;
				/** Raindrop.io token; searches Casey’s bookmarks for the owner only. */
				RAINDROP_TOKEN?: string;
				/** Buttondown API key; signs readers up for the newsletter from `/api/subscribe`. */
				BUTTONDOWN_API_KEY?: string;
				NODE_ENV: string;
				WEBMENTION_IO_TOKEN: string;
				/** The site's static files; the backfeed reads `/backfeed.json` from it. */
				ASSETS?: Pick<Fetcher, 'fetch'>;
			};
		}
	}
}

export {};

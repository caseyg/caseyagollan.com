// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
/// <reference types="@cloudflare/workers-types" />

declare global {
	interface Window {
		telescopicText?: { createTelescopicTextFromBulletedList: (content: string) => HTMLElement };
		createTelescopicTextFromBulletedList: (content: string) => HTMLElement;
	}
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		interface Platform {
			env?: {
				INSIGHT_CACHE: KVNamespace;
				SCREENSHOTS?: R2Bucket;
				CLOUDFLARE_ACCOUNT_ID?: string;
				CLOUDFLARE_API_TOKEN?: string;
				GITHUB_CONTENT_TOKEN?: string;
				INFERENCE_COOP_API_KEY: string;
				KAGI_API_KEY: string;
				NODE_ENV: string;
				WEBMENTION_IO_TOKEN: string;
			};
		}
	}
}

export {};

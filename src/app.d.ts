// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
/// <reference types="@cloudflare/workers-types" />

declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		interface Platform {
			env?: {
				INSIGHT_CACHE: KVNamespace;
				ANTHROPIC_API_KEY: string;
				NODE_ENV: string;
				WEBMENTION_IO_TOKEN: string;
			};
		}
	}
}

export {};

// Source entrypoint: keep SvelteKit's generated fetch handler and add durable delivery cron.
import application from './.svelte-kit/cloudflare/_worker.js';
import { publishingConfig } from './src/lib/server/publishing/config.ts';
import { processPublishing } from './src/lib/server/publishing/delivery.ts';

export { IndieAuthStore } from './src/lib/server/indieauth/store.ts';

export default {
  fetch(request, env, context) {
    return application.fetch(request, env, context);
  },
  async scheduled(_event, env, _context) {
    try {
      const result = await processPublishing(publishingConfig(env));
      console.log(JSON.stringify({ event: 'publishing_delivery_scan', ...result }));
    } catch {
      // Provider/network errors and credentials must not enter Worker logs.
      console.error(JSON.stringify({ event: 'publishing_delivery_scan_failed' }));
      throw new Error('Publishing delivery scan failed');
    }
  }
};

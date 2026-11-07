// Source entrypoint: keep SvelteKit's fetch handler and add background publishing work.
import application from './.svelte-kit/cloudflare/_worker.js';
import { publishingConfig } from './src/lib/server/publishing/config.ts';
import { processPublishing } from './src/lib/server/publishing/delivery.ts';
import { processPesos } from './src/lib/server/publishing/pesos/importer.ts';

export { IndieAuthStore } from './src/lib/server/indieauth/store.ts';

export default {
  fetch(request, env, context) {
    return application.fetch(request, env, context);
  },
  async scheduled(event, env, _context) {
    let failed = false;
    try {
      const result = await processPublishing(publishingConfig(env));
      console.log(JSON.stringify({ event: 'publishing_delivery_scan', ...result }));
    } catch {
      // Provider/network errors and credentials must not enter Worker logs.
      console.error(JSON.stringify({ event: 'publishing_delivery_scan_failed' }));
      failed = true;
    }
    // Preserve delivery's five-minute schedule; import at :00, :10, :20, etc.
    if (Math.floor(event.scheduledTime / 60_000) % 10 === 0) {
      try {
        const result = await processPesos(env);
        console.log(JSON.stringify({ event: 'pesos_scan', ...result }));
      } catch {
        console.error(JSON.stringify({ event: 'pesos_scan_failed' }));
        failed = true;
      }
    }
    if (failed) throw new Error('Background publishing work failed');
  }
};

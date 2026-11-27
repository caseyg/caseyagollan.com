// Source entrypoint: keep SvelteKit's fetch handler and add background publishing work.
import application from './.svelte-kit/cloudflare/_worker.js';
import { publishingConfig } from './src/lib/server/publishing/config.ts';
import { processPublishing } from './src/lib/server/publishing/delivery.ts';
import { processPesos } from './src/lib/server/publishing/pesos/importer.ts';
import { syncWebmentions } from './src/lib/server/webmentions.ts';
import { publishFeedUpdates } from './src/lib/server/websub.ts';
import { syncBackfeed } from './src/lib/server/backfeed.ts';
import { cursorRequest } from './src/lib/server/cursors/route.ts';

import { routeAgentRequest } from 'agents';
import { chatViewer, withViewer } from './src/lib/server/chat/identity.ts';
import { CHAT_OWNER_ONLY } from './src/lib/chat.ts';
import { withPreviewOrigin } from './src/lib/server/indieauth/contracts.ts';

export { IndieAuthStore } from './src/lib/server/indieauth/store.ts';
export { ChatThread } from './src/lib/server/chat/agent.ts';
export { CursorRoom } from './src/lib/server/cursors/room.ts';
export { SourceStore } from './src/lib/server/sources/store.ts';

/**
 * /chat threads are Agents (one Durable Object each) at /agents/chat-thread/<id>. Only
 * their WebSockets are public: the Worker works out who is connecting and tells the agent
 * in a header it sets itself. Plain HTTP to an agent is refused.
 */
async function chatAgentRequest(request, env) {
  return routeAgentRequest(request, env, {
    onBeforeConnect: async (req, route) => {
      if (route.className !== 'ChatThread' || !/^[a-z0-9]{10}$/.test(route.name)) return new Response('Not found', { status: 404 });
      if (req.headers.get('origin') && new URL(req.headers.get('origin')).host !== new URL(req.url).host) return new Response('Forbidden', { status: 403 });
      const viewer = await chatViewer(req, env).catch(() => null);
      // Owner-only for now (CHAT_OWNER_ONLY in src/lib/chat.ts).
      if (CHAT_OWNER_ONLY && !viewer?.owner) return new Response('Not found', { status: 404 });
      return withViewer(req, viewer);
    },
    onBeforeRequest: () => new Response('Not found', { status: 404 })
  });
}

export default {
  fetch(request, workerEnv, context) {
    // On branch previews, owner sign-in is bound to the host this request came in on.
    const env = withPreviewOrigin(workerEnv, request);
    // Storybook is deployed separately (wrangler.storybook.jsonc) under the same /storybook/ path.
    const { pathname } = new URL(request.url);
    if (env.STORYBOOK && (pathname === '/storybook' || pathname.startsWith('/storybook/'))) return env.STORYBOOK.fetch(request);
    // Live cursors and cursor chat: one Durable Object per page, at /parties/cursors/<page>.
    if (pathname.startsWith('/parties/')) return cursorRequest(request, env);
    if (pathname.startsWith('/agents/')) return chatAgentRequest(request, env).then((response) => response ?? new Response('Not found', { status: 404 }));
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
    // Tell the WebSub hub when this deploy changed the feeds, so readers get new posts pushed.
    try {
      const result = await publishFeedUpdates(env);
      if (result.status === 'pinged') console.log(JSON.stringify({ event: 'websub_ping', ...result }));
    } catch {
      console.error(JSON.stringify({ event: 'websub_ping_failed' }));
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
    // Keep the site's own copy of incoming Webmentions; previews have no token and skip it.
    try {
      const result = await syncWebmentions(env);
      if (!result.skipped) console.log(JSON.stringify({ event: 'webmention_sync', ...result }));
    } catch {
      console.error(JSON.stringify({ event: 'webmention_sync_failed' }));
      failed = true;
    }
    // Read replies, favorites and reposts straight from the posts' Mastodon and Bluesky copies,
    // at :05, :15, :25, etc., away from the import.
    if (Math.floor(event.scheduledTime / 60_000) % 10 === 5) {
      try {
        const result = await syncBackfeed(env);
        if (!result.skipped) console.log(JSON.stringify({ event: 'backfeed_sync', ...result }));
      } catch {
        console.error(JSON.stringify({ event: 'backfeed_sync_failed' }));
        failed = true;
      }
    }
    // Bring the site's own copy of Casey's Readwise, Raindrop and Are.na up to date. The store decides
    // what is due, logs its own counts, and wakes itself to carry on a long first sync.
    if (env.SOURCES && env.SOURCES_SYNC === 'true') {
      try {
        await env.SOURCES.get(env.SOURCES.idFromName('main')).tick();
      } catch {
        console.error(JSON.stringify({ event: 'source_sync_failed' }));
        failed = true;
      }
    }
    if (failed) throw new Error('Background publishing work failed');
  }
};

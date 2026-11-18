# Plan: a plugin-based IndieWeb starter

Status: planning only, written 2026-11-17. Nothing here is built yet. The alternative, extending IndieKit instead, is in [INDIEKIT-ALTERNATIVE.md](INDIEKIT-ALTERNATIVE.md).

## Was there an earlier plan?

No. Before writing this, I searched `docs/` (including `docs/indieweb-publishing/`), `AGENTS.md`, `PLAN.md`, `TODO.md`, every branch on `origin`, the content repo, the project files and the project's past threads. None of them has a plan for turning the stack into reusable software. The closest material is:

- [DESIGN.md](DESIGN.md), the plan that replaced IndieKit with native Micropub and IndieAuth in the Worker (PR 77).
- [PROJECTS.md](PROJECTS.md), the survey of reusable Micropub, IndieAuth and Workers projects.
- Casey's notes from September 2025 (`content/notes/2025-09-06-indiekit-progress.md`): "I should separate the 'Kit' repository from the static 11ty site". That is the same split this plan makes.

So this is a new draft, and it builds on those three.

## Goal

Make a small core with plugins that lets someone else run what this site runs: Micropub and IndieAuth on their own domain, posts kept as Markdown in Git, syndication to Mastodon, Bluesky and Standard.site, imports from silos (PESOS), Webmentions and backfeed, WebSub, a newsletter, and an owner composer. Everything past the core is a plugin, including the host platform. Cloudflare Workers is the first target and the reference platform. Vercel is the second. Any Micropub client (Quill, Indigenous, iA Writer) should work without the bundled composer.

What it is not: a hosted service, a theme, or a copy of this site. The library graph, wiki browser, tables and the rest stay here.

## How others do it

| Project | Shape | Where extension lives | Runtime and state | What to take | What to avoid |
| --- | --- | --- | --- | --- | --- |
| [IndieKit](https://getindiekit.com/plugins/) (1.0 beta) | Self-hosted publishing server sitting beside a static site | Five plugin types: **content stores** (GitHub, GitLab, Gitea, FTP, S3, file system), **endpoints** (Micropub, media, IndieAuth, Microsub, JSON Feed, Webmention.io), **post types**, **publication presets** (Eleventy, Hugo, Jekyll) and **syndicators** (Mastodon, Bluesky, Internet Archive). Each plugin is a class whose `init(Indiekit)` calls `addStore`, `addSyndicator` and so on. | Long-running Node and Express server, with MongoDB for post data and tokens | The plugin taxonomy and the config shape. Presets that map Micropub properties to an SSG's file layout. Stores that only read and write files. | Express routes and Node APIs inside plugins, which tie them to one runtime. A syndicator returns one URL, so it can't express threads, quote posts or backfeed. A database is needed beside Git. |
| [Micro.blog](https://help.micro.blog/t/plug-ins/104) | Hosted blog platform built on Hugo | Plug-ins are Hugo theme components: templates, partials and settings, so presentation only. Cross-posting (Mastodon, Bluesky, Threads, Medium, Pixelfed, Nostr…) and reply backfeed belong to the platform and are switched on as settings. | Hosted, with Micropub and ActivityPub built in | Integrations as settings rather than code: connect an account, toggle it, done. Replies come back without setup. Plug-ins are easy to write because they can't break publishing. | Being closed: nobody can add a new cross-post target. |
| [Quill](https://quill.p3k.io/) | A Micropub client only | None. It reads the server's `q=config` (`syndicate-to`, `media-endpoint`, channels) and adapts to it. | PHP web app; the server does everything | Protocol first. Server capabilities are advertised through Micropub queries, so clients need no plugin. This is why our composer can stay optional. | Nothing. It proves the core's contract should be Micropub. |
| [Known](https://withknown.com/) | Self-hosted PHP social publishing, multi-user | Plugins add content types and POSSE targets (Twitter, Flickr, and others), through events. | PHP with MySQL or MongoDB | Content types as plugins. POSSE targets as plugins. | Plugins that touched internal APIs rotted when the silos and the core changed. Keep plugin surfaces small and stable. |
| WordPress IndieWeb plugins ([Webmention](https://wordpress.org/plugins/webmention/), Micropub, IndieAuth, Syndication Links, ActivityPub) | Separate plugins, one per protocol | WordPress actions and filters. They interoperate through shared post meta, mostly mf2 property names. | PHP with MySQL | One package per protocol, coordinated through events and a shared vocabulary (mf2), not by calling each other. | Hooks with no types or declared permissions: any plugin can do anything. |
| [EmDash](https://github.com/emdash-cms/emdash) (Cloudflare, 2026) | CMS built on Astro, aimed at WordPress users | `definePlugin()` with lifecycle hooks (such as `content:afterSave`), settings, admin pages, API routes and KV storage. Each plugin declares a **capability manifest** (`content:read`, `email:send`…) and runs in its own Worker isolate through Dynamic Worker Loaders, or in `workerd` on Node. | Workers with D1 and R2, or Node with SQLite. Portable through Kysely (SQL) and the S3 API (media). | Capability manifests. Portable storage through common APIs. Hooks named after content events. The same plugin code on Workers and Node. | DB-first content, where we want Git and Markdown. Sandboxing needs a paid Workers plan, so it can't be the only mode. |
| [davidwkeith/workers](https://github.com/davidwkeith/workers) | Now a large Workers-native suite: IndieAuth, Micropub, Webmention, Microsub, a WebSub hub, ActivityPub, Solid, atproto PDS, MCP. Unreleased. See [PRIOR-ART.md](PRIOR-ART.md). | One package per protocol, mounted under path prefixes | Workers with D1, R2, Durable Objects and Queues, plus `cf-shims` for Node | The closest prior art, and a possible foundation. Cloudflare bindings shimmed elsewhere instead of new abstractions. | Its D1 content store, not Git. No POSSE or PESOS. |
| [Anglesite](https://anglesite.dwk.io) ([skills](https://github.com/Anglesite/anglesite-skills)), by the same author | A free, ISC-licensed "AI webmaster": a Claude Code and Cowork plugin that scaffolds, designs, deploys and maintains static Astro sites on Cloudflare Workers. It covers microformats, RSS, rel=me, POSSE, Buttondown, analytics and imports from WordPress, Squarespace and Wix. | Agent skills (`/anglesite:indieweb`, `/anglesite:import`, "check my site", "update my site") rather than code plugins, with 56 site-type guides | Static Astro on Workers. The first consumer of the `@dwk` packages. | Setup and upkeep done by an agent in conversation, so the owner never edits config. Deploy-time scans for leaked secrets and unauthorised scripts. Privacy defaults (no cookies or third-party JS). | No formal plugin system. Static only, so the dynamic parts depend on the `@dwk` Workers packages. |
| [benjifs/micropub](https://github.com/benjifs/micropub) and [github-store](https://github.com/benjifs/github-store) | A serverless Micropub endpoint with a store object | A store adapter passed in | Netlify Functions | A tiny store interface keeps the endpoint portable. | Node streams and Busboy for multipart, which aren't web-standard. |
| Services: Bridgy, Bridgy Fed, webmention.io, granary | Hosted bridges | Not extensible; you point your site at them | Hosted | The core should treat a service as one more plugin. Our webmention.io sync already is one. | Depending on them for anything the owner wants to keep. |

What the comparison says:

1. **IndieKit's taxonomy is right, but its runtime isn't.** Copy the plugin kinds and the config shape. Run plugins as web-standard `fetch` handlers and functions over platform primitives, not as Express middleware in a long-running Node server.
2. **Micropub is the public contract.** As Quill shows, a client needs no plugin when the server advertises what it can do. Plugins extend the server through `q=` queries and properties, and those are documented in [proposals/](proposals/).
3. **Integrations are settings to the owner.** On Micro.blog, people connect accounts rather than install code. Plugins here should contribute a settings panel on `/account` (connect Bluesky, set a Buttondown theme), not just environment variables.
4. **Declare capabilities now, sandbox later.** EmDash shows a Workers-native way to isolate plugins. Writing manifests from day one keeps that option open at no cost.
5. **Keep the vocabulary shared.** WordPress plugins work together through mf2 properties. Here, every plugin reads and writes mf2 JSON, and only presets turn it into files.

## Architecture

```
            Micropub clients (Quill, iA Writer, our composer)
                               │
        ┌──────────────────────▼───────────────────────┐
        │  core: Micropub · media · auth gate · outbox  │
        │  events · scheduler · post model (mf2 JSON)   │
        └─┬─────────┬──────────┬──────────┬──────────┬──┘
          │         │          │          │          │
      platform    store     preset   syndicators  importers   interactions   notifiers   ui
     Cloudflare   GitHub    Markdown  Mastodon     Mastodon    webmention.io  WebSub      composer
     Vercel       Gitea     +YAML     Bluesky      Bluesky     Mastodon       Buttondown  editor
     Node/local   files     Hugo      Standard.    GitHub      backfeed       Webmention  syndicate
                  R2/S3     Eleventy  site         Are.na      Bluesky        send        account
                                                               backfeed
```

The core is a function, not a server:

```ts
const kit = createKit(config);          // config from indie.config.ts
kit.fetch(request): Promise<Response | undefined>  // undefined = not ours, let the framework route it
kit.scheduled(time: Date): Promise<TaskReport[]>
```

A framework adapter mounts it. The SvelteKit adapter is a `handle` hook. Astro gets middleware, Next.js a route handler, and a bare Worker gets `export default { fetch, scheduled }`. This site's `worker.mjs`, which wraps SvelteKit and runs five cron jobs by hand, turns into one `kit.scheduled` call.

### The post model

Every plugin sees a post as Micropub's mf2 JSON (`{ type: ['h-entry'], properties: { content: [...], photo: [...] } }`) plus a few kit fields: `path`, `url`, `revision`, `status` (draft, published or deleted) and `previousUrls`. `document.ts` already does this conversion, so it becomes the Markdown preset. Unknown properties always round-trip, which is a rule [DESIGN.md](DESIGN.md) already keeps.

### Events

The core emits typed events and plugins subscribe:

| Event | Fired when | Used by today |
| --- | --- | --- |
| `post.created`, `post.updated`, `post.deleted`, `post.undeleted` | A Micropub write is committed | Outbox enqueue |
| `post.public` | The build containing that revision is live (publication manifest proves it) | Webmention send, syndication, Standard.site, WebSub ping |
| `post.renamed` | `mp-slug` change | Redirects (`_micropubPreviousUrls`) |
| `interaction.received` | A Webmention or backfeed item is stored | Counts, moderation |
| `import.created` | PESOS wrote a post | Duplicate index |

`post.public` matters most. It is the existing "send only after the intended revision is public" rule, made into the one event every outbound plugin waits for.

## Plugin interfaces

Each plugin is a module that exports a definition. The shape follows IndieKit (`init(kit)` registers things), with a manifest added in EmDash's style:

```ts
export default definePlugin({
  name: '@indie/syndicate-bluesky',
  capabilities: ['net:bsky.social', 'state:bluesky', 'posts:read', 'media:read'],
  settings: { identifier: { type: 'string' }, appPassword: { type: 'secret', optional: true } },
  setup(kit, settings) {
    kit.addSyndicator(blueskySyndicator(settings));
    kit.addRoute('GET', '/oauth/bluesky/*', oauthRoutes);  // OAuth callback
    kit.addAccountPanel(connectPanel);                     // "Connect Bluesky" on /account
  }
});
```

What `kit.add…` accepts:

| Kind | Interface (simplified) | Contract tests check |
| --- | --- | --- |
| **Platform** (exactly one) | `blob(name): BlobStore` with conditional put (ETag) · `state(name): StateStore` with transactions, for auth and sessions · `lease(key, ttl)` · `schedule(cron, task)` · `images?: ImageResizer` · `waitUntil` · `env` · `mode: 'production' \| 'preview' \| 'dev'` | Conditional writes refuse stale ETags. Leases are exclusive. Preview mode blocks outbound sends. |
| **Content store** | `read(path)`, `list(prefix)`, `write(path, body, { ifRevision })`, `delete(path, { ifRevision })`, returning `{ revision }` | Stale-revision writes fail. Rename keeps history. Large files. |
| **Media store** | `put(key, stream, type)`, `get`, `delete`, `publicUrl(key)` | Streams, MIME, 25 MB limit. |
| **Preset** (content format) | `pathFor(post)`, `serialize(post) → string`, `parse(string) → post`, `postTypes` | Round-trips every fixture post exactly, including unknown properties and local timestamps. |
| **Post type** | `name`, `detect(properties)`, `required`, `composerFields` | Detection matches the [Post Type Discovery](https://indieweb.org/post-type-discovery) fixtures. |
| **Syndicator** | `uid`, `name`, `limits { chars, bytes, photos, threadMax }` · `plan(post) → Part[]` (thread splitting, quote detection, photo assignment) · `send(part, progress) → SentPart` · `update?` · `delete?` · `readInteractions?(sent) → Mention[]` | Resumes a half-sent thread without duplicates. Respects limits. Idempotent per key. |
| **Importer** (PESOS) | `id`, `since` · `page(cursor) → { activities, cursor }` · `identity(activity)` for de-duplication · `toPost(activity)` | No duplicates with posts already syndicated from the site. Cursor resume. Private items never become public posts. |
| **Interaction source** | `sync(targets, state) → Mention[]` | Moderation is kept, re-sync is stable, HTML is sanitized. |
| **Notifier** | Subscribes to events. `run(event)` | Runs once per revision. |
| **Auth provider** | `verify(token) → { me, scope, client }` · optional `routes` for a built-in server | Scope enforcement. Expired tokens. |
| **Micropub extension** | `query(name, handler)` for `q=category` and the like · `property(name, handler)` for `mp-slug` and similar | Listed in `q=config`, with a proposal doc. |
| **UI** (optional) | `addRoute` for pages, `addAccountPanel(schema)` rendered by the host's design system | Storybook stories, in the host's components. |

Two design rules:

- **Syndicators plan first, then send parts.** The single "syndicate → URL" call in IndieKit can't express what this site already does: reply-chain threads, native quotes, up to four photos with alt text, resumable progress and backfeed. Splitting planning from sending, with progress stored in the outbox, makes the existing `syndication-thread.ts` / `delivery.ts` behaviour the general case.
- **Plugins never touch platform bindings.** No plugin imports `R2Bucket` or `DurableObject`. They ask the platform for a `BlobStore` or `StateStore` by name. That rule is what makes Vercel possible.

### Platform plugins

| Primitive | Cloudflare | Vercel | Netlify | Node or local |
| --- | --- | --- | --- | --- |
| Blob with conditional put (outbox, receipts, archives) | R2 (`onlyIf` ETag) | Vercel Blob for media. Outbox and leases go in the state store, because conditional writes in Blob need checking. | Netlify Blobs; outbox in Netlify DB if conditional writes are missing | File system |
| State store (IndieAuth, sessions, OAuth DPoP keys) | Durable Object with SQLite (today's `IndieAuthStore`) | Postgres (Neon) or Redis (Upstash) from the Marketplace | Netlify DB (Postgres) | SQLite |
| Leases | R2 conditional writes (today) | Redis `SET NX PX` or Postgres advisory lock | Postgres advisory lock in Netlify DB | In-process |
| Cron | Cron Triggers | Vercel Cron (fewer runs on the Hobby plan) | Scheduled functions (production deploys only) | `setInterval` or system cron |
| Images (shrinking for Bluesky's 1 MB) | Images binding | Next/Image optimizer or `sharp` in a function | Netlify Image CDN or `sharp` in a function | `sharp` |
| Previews | Worker Previews, side effects off | Preview deployments, same flag | Deploy previews, same flag | n/a |

Cloudflare stays the reference: everything runs on the free and $5 plans with no third-party service. Vercel needs one storage integration from the Marketplace, and Netlify needs Netlify DB for state. The starter's setup says so plainly.

### Other hosts, including IndieWeb and community ones

Researched 2026-11-17 from the IndieWeb wiki's [web hosting](https://indieweb.org/web_hosting) page and the web. The wiki lists no community or co-op host with Cloudflare- or Vercel-style DX, meaning git-push deploys, previews, functions, storage and cron in one place. The only hosted IndieWeb offering there is Micro.blog, which isn't extensible. So the hosts below fall into four groups, and each group needs a different kind of support.

| Group | Hosts | Functions, storage, cron | How the kit supports it |
| --- | --- | --- | --- |
| Serverless with full DX | **Netlify**: functions and edge functions, Netlify Blobs, scheduled functions (production deploys only, which matches our preview rule), Netlify DB (Postgres). Long the usual home of Eleventy IndieWeb sites; benjifs/micropub was built for it. | All of them | `platform-netlify`, planned alongside Vercel in Phase 3. Check whether Blobs supports conditional writes for the outbox, or use Netlify DB for that state. |
| | **Deno Deploy** had KV, queues and `Deno.cron`. | All of them, but ending | Skip it. On 2026-10-09 the Deno team announced it is [joining Cloudflare](https://thenewstack.io/cloudflare-acquires-deno-ryan-dahl/), with Deploy shutting down about six months later and customers moved to Workers. Cloudflare also said it aims to make Workers easier to run on your own infrastructure, which would help the self-hosting group below. |
| | **Bunny.net**: Edge Scripting, S3-compatible storage, Bunny Database (libSQL, in preview). European. | No scheduled jobs found | Possible later. Cron would need an outside trigger. |
| | **Supabase**: Postgres, storage, edge functions, `pg_cron`. **Val Town**: small hosted functions with crons, blob storage and SQLite. | All of them | Better as backends than hosts. Supabase could be a state and blob store for any platform. A Val Town function could run one plugin, such as a backfeed poller beside a static site. |
| Long-running Node (containers and VMs) | Fly.io, Render, Railway (IndieKit's documented host), DigitalOcean App Platform. Self-hosted PaaS such as **Coolify** and **Dokploy** gives git-push deploys and previews on your own VPS. | Yes, using your own database and cron | `platform-node` plus a Docker image. One plugin covers all of them, plus a home server. |
| Co-ops and community hosts | **May First Movement Technology** (US co-op), **Webarchitects** (UK co-op), HCoop, **Co-op Cloud** (shared app recipes deployed with `abra`, used by tech co-ops), IndieHosters, PikaPods, NearlyFreeSpeech.NET, Opalstack | Mostly shared hosting or containers. No edge functions or previews. | `platform-node` with SQLite and files. Publishing a **Co-op Cloud recipe** and a PikaPods app would make the kit a one-step install at co-ops. This is how a community host could offer the kit to its members. |
| Static only | GitHub, GitLab, Codeberg and Sourcehut Pages, Neocities, Nekoweb, Bear Blog, omg.lol | None | A **split deploy**: the site's static output goes there, and the kit (Micropub, IndieAuth, delivery) runs on any platform above, on its own subdomain. The site's HTML points its `rel=micropub`, `authorization_endpoint` and `webmention` links at that subdomain. This is how IndieKit and webmention.io already work beside static sites. |

What this changes in the plan:

- After Cloudflare, the platforms are **Vercel**, **Netlify** and **Node/Docker** (one plugin reaches VMs, PaaS, Coolify, co-ops and home servers). Deno Deploy is out.
- **Split deploy** becomes a supported mode, not a workaround. The kit already runs as `kit.fetch` mounted anywhere. It also needs a "build hook" plugin kind that triggers the static host's rebuild (a GitHub Pages workflow dispatch, a Neocities upload, a Netlify build hook) after a content commit.
- **Community distribution** joins the packaging list: a Co-op Cloud recipe and a PikaPods listing beside the Deploy to Cloudflare and Vercel buttons.

### Self-hosting app platforms: Cloudron and YunoHost

Many IndieWeb people self-host with [Cloudron](https://docs.cloudron.io/packaging/) or [YunoHost](https://yunohost.org/packaging_apps). Both install apps from a catalog onto your own server, with a domain, TLS, backups, updates and single sign-on handled for you. Neither is a new runtime. Both run the `platform-node` build, so they are **packages**, not new platform plugins:

| | Cloudron | YunoHost |
| --- | --- | --- |
| Package format | `CloudronManifest.json` plus a Dockerfile built on Cloudron's base image | `manifest.toml` (packaging v2) plus install, upgrade, backup and restore scripts. Runs as a systemd service behind YunoHost's nginx. |
| State | `localstorage` addon (the persistent `/app/data`) for SQLite and media. The `postgresql` or `redis` addons are optional. | `data_dir` resource for SQLite and media, or its `database` resource |
| Cron | `scheduler` addon calls `kit scheduled` | Scheduled functions (production deploys only) | A systemd timer or cron file from the install script |
| Sign-in | The kit's own IndieAuth with passkeys stays the login, because `me` is the owner's domain. The platform's SSO (Cloudron's OIDC, YunoHost's SSOwat) is offered only for the `/account` pages. | Same. The IndieAuth and Micropub paths must be public, or clients can't reach them. |
| Catalog | Cloudron App Store, or a community repo until it's accepted | The YunoHost app catalog (a pull request to its apps repo), as a `*_ynh` package repo |
| Fits | One-click installs with git-push for the site's content repo | Home servers and small community servers. YunoHost already lists several IndieWeb apps. |

Both need the same thing from the kit: everything configured from environment variables and a data directory, one long-running process, health and backup hooks, and no outbound side effects until the owner finishes setup. `platform-node` provides all of that, so these packages are thin. The work is mostly packaging, testing upgrades, and keeping the catalog entries current.

## How today's features map onto plugins

| Feature today | Code | Becomes | Generic? |
| --- | --- | --- | --- |
| Micropub create, update, delete, undelete, source, list | `publishing/micropub.ts`, `micropub-list.ts` | core | Yes |
| `q=category`, `q=contact`, `mp-slug`, syndication threads | `micropub.ts`, PR 198, PR 212, [proposal](proposals/micropub-syndication-threads.md) | core Micropub extensions | Yes, and documented |
| Media endpoint | `publishing/media.ts` | core, plus a media store plugin (R2) | Yes |
| IndieAuth server with passkeys | `indieauth/*` | `@indie/auth-indieauth` (built-in server). The external token endpoint mode becomes `@indie/auth-external`. | Yes. The rpID and hostname become config. |
| Git writes | `publishing/github.ts` | `@indie/store-github`. Later Gitea/Forgejo and file system. | Yes |
| Drafts repo | `config.ts` `draftsConfig` | A second store instance named `drafts` | Yes |
| Markdown and YAML documents | `publishing/document.ts`, `post-slug.ts` | `@indie/preset-markdown`, with slug rules as preset options | Yes. Paths match this site's IA, so path patterns become options. |
| Outbox, receipts, publication manifest | `outbox.ts`, `delivery.ts`, `publication.ts` | core | Yes. Needs `CANONICAL` and R2 removed. |
| Mastodon syndication | `syndication.ts`, `syndication-thread.ts`, `syndication-photos.ts` | `@indie/syndicate-mastodon` | Yes |
| Bluesky syndication with OAuth and DPoP, rich text, quotes | `bluesky-oauth*.ts`, `dpop.ts`, `bluesky-richtext.ts` | `@indie/syndicate-bluesky` | Yes |
| Standard.site records (in progress) | its own thread | `@indie/syndicate-standard-site`, using `update` and `delete` | Yes |
| PESOS: Mastodon, Bluesky, GitHub, Are.na | `pesos/*`; GitHub and Are.na are in PR 217, not merged yet | One importer plugin each, with shared de-duplication in core | Yes |
| Social archive imports | `utils/import-social-archive.ts` | A CLI command on the same importers | Yes |
| Webmention send | `publishing/webmention.ts` | `@indie/webmention` (notifier on `post.public`) | Yes |
| Webmention archive from webmention.io | `server/webmentions.ts` | `@indie/interactions-webmention-io` | Yes |
| Native Mastodon and Bluesky backfeed | `server/backfeed.ts` | Each syndicator's `readInteractions` | Yes. `ownAccounts()` comes from config. |
| WebSub ping | `server/websub.ts` | `@indie/websub` | Yes |
| Feeds and sitemap | `server/feeds.ts`, `scoped-feeds.ts`, `sitemap.ts` | `@indie/feeds` (RSS, Atom, JSON Feed from the store) | Yes, as long as the theme supplies HTML |
| Buttondown signup and theme | `buttondown*.ts` | `@indie/newsletter-buttondown` | Yes |
| Composer, editor, syndicate page | `routes/new`, `editor`, `[year]/…/syndicate`, `composer.ts` | `@indie/ui-svelte`, optional | Mostly. Built on this site's design system, so it ships with its own base tokens. |
| Site identity (h-card, rel=me) | `src/lib/identity.ts` | Core config `identity` | Yes. Already one file. |
| Library graph, LibraryThing, Open Library | `library-*`, `utils/librarything*` | Stays here | Site-specific |
| Wiki browser (cag.wiki) | `lib/wiki`, `routes/wiki` | Stays here, maybe a future "Obsidian Publish source" plugin | Site-specific |
| Tables (tldraw), Readwise, Raindrop, insights, screenshots, home graph, Cuelume sounds, nav | various | Stays here | Site-specific |

### Feature index: publishing features by PR

The table above is grouped by module. This index lists the publishing behaviours built since IndieKit was replaced, and where each one lands. Nothing is dropped: each is a core capability, part of a plugin, or theme work in the starter.

| Feature | PR | Lands in | How |
| --- | --- | --- | --- |
| Thread posting (reply chains, resumable) | 203 | core (Micropub `syndication-thread` property) + each syndicator's `plan()` + `ui-svelte` `ThreadComposer` | The planner splits the post (`splitIntoThread`), and the outbox stores per-part receipts, so any syndicator gets threads by declaring `threadMax`. |
| Multiple photos per post, with alt text | 204 | syndicator `plan()` (photo assignment per part) + platform `images` (shrinking) | Each syndicator declares `limits.photos`, `limits.altChars` and `limits.photoBytes`. Core assigns photos by `syndication-photo-post`. |
| Native quote posts | 218 | `syndicate-bluesky` and `syndicate-mastodon` `plan()` | Detects `quotation-of` and repost-with-comment, then uses the network's own quote type. |
| Link cards and linked mentions on Bluesky | 142 | `syndicate-bluesky` (rich text facets, external embed) | Uses core's safe public fetch for the card's title and image. |
| Bluesky OAuth with app-password fallback | 221 | `syndicate-bluesky` + an account panel | Its tokens go in the platform `StateStore`. |
| Tags, `q=category` | 212 | core Micropub extension | Read from the content store's index, so it works for any preset. |
| Person tags (`u-category` h-cards), `q=contact` | 212 | core extension + a **contacts provider** plugin kind | Today's provider reads `social-follows.json`. Others could read a CardDAV address book or the owner's follows on Mastodon and Bluesky. |
| Tag pages, tag cloud, type filters, per-type feeds, On this day | 145, 151 and later | starter theme + `@indie/feeds` | Presentation. The feeds plugin provides scoped feeds by type and tag. |
| Slug renames with redirects | 198 | core (`mp-slug`, `previousUrls`) + preset path rules + a framework adapter hook for redirects | Delivery treats a renamed post as the same publication, so it is never posted twice. |
| Drafts in a private repo | 143 | a second content store named `drafts` | Any store can hold drafts: a private repo, R2 or the local disk. |
| Composer, editor, syndicate page, rich editor quotes and figures | 143, 148, 153, 199 | `ui-svelte` | Mounted by the starter. |
| Post list in Micropub (`q=source` listing) | late 2026 | core | Standard. |
| Markdown everywhere, HTML only when it renders differently | 148, content 16 | preset (`htmlToMarkdown` with the `sameRendering` check) | Every importer and editor write goes through the preset, so Markdown stays the default. |
| PESOS from Mastodon, Bluesky, GitHub, Are.na, with duplicate merging | 217 and earlier | importer plugins + core de-duplication | Importers skip anything already in the outbox's receipts. |
| Saved copies of others' posts (social snapshots) | earlier | a **citations** plugin | Fetches and stores a static card for each linked post, for reply and like contexts. |
| Webmention archive and moderation | late 2026 | `interactions-webmention-io` + core moderation store | Moderation is shared by every interaction source. |
| Native Mastodon and Bluesky backfeed | late 2026 | each syndicator's `readInteractions` | Merged with Webmentions, with Bridgy copies dropped. |
| WebSub ping, sitemap | 211 | `@indie/websub`, `@indie/feeds` | |
| Buttondown signup and theme | 205 | `@indie/newsletter-buttondown` | |
| h-card and rel=me from one identity | 206 | core config `identity` | |
| `fediverse:creator` byline, OpenSearch | late 2026 | starter theme head tags, read from `identity` | |
| Standard.site records | in progress | `syndicate-standard-site` | Uses `update` and `delete`, so edits update the record. |

Protocol extensions in this list (`syndication-thread`, `syndication-photo-post`, `q=contact` silos) are documented in [proposals/](proposals/). A kit plugin that adds one has to ship its proposal too, the same rule this repo follows.

### Couplings to remove before extraction

- **R2 types everywhere.** 16 server files take `R2Bucket` directly. Each needs a `BlobStore`.
- **Hard-coded identity.** 19 server and util files contain `caseyagollan.com`, `social.coop` or `America/New_York`. Examples: `CANONICAL` in `publication.ts`, the `origin` default in `backfeed.ts`, the `caseyagollan-pesos` User-Agent, and the timezone default in `config.ts`.
- **Flat environment config.** `PUBLISHING_*` variables are read in `config.ts`. Each plugin should own its settings with a schema. Environment variables stay for secrets only.
- **Cron by hand.** `worker.mjs` runs five jobs with minute arithmetic. Plugins should register tasks with an interval and let the scheduler spread them out.
- **SvelteKit inside server code.** A few server modules import from `$lib` or SvelteKit types. The core must import nothing from a framework.

## IndieKit: relate, interoperate, or join?

Four levels, from cheapest to most work:

1. **Protocol level (free).** Both speak Micropub and IndieAuth, so clients, Bridgy and webmention.io already work with either.
2. **Content level (cheap).** Ship presets that read and write IndieKit's Eleventy, Hugo and Jekyll layouts. Someone on IndieKit could point this kit at their repo and keep their files. This site's own content started as IndieKit output, so we have test fixtures.
3. **Plugin level (medium).** An adapter that wraps IndieKit **store** and **syndicator** plugins, which are mostly classes with async methods over `fetch`. Ones that need Express, `fs` or Node-only libraries won't run on Workers, and endpoint plugins don't fit at all. Worth doing once the core is stable, as a way to borrow syndicators we don't have yet (Internet Archive, LinkedIn).
4. **Upstream level (social).** Offer the thread planning, backfeed and `post.public` ideas to IndieKit as proposals, alongside the Micropub proposals in [proposals/](proposals/).

Building on IndieKit itself, or on EmDash, was considered and set aside. IndieKit needs a long-running Node server and a database. EmDash keeps content in SQL and needs a paid plan for sandboxed plugins. Both conflict with "Markdown in Git, runs on the free Workers plan." EmDash's capability manifests are still worth copying.

## Learning from Anglesite: an agent-run kit

[Anglesite](https://anglesite.dwk.io) shows a different way to deliver the same goal. The owner doesn't install packages and edit `indie.config.ts`. They install a Claude plugin and say what they want, and the agent scaffolds the site, wires the IndieWeb pieces, deploys to Workers, and later runs "check my site" and "update my site". It's built on the `@dwk` Workers packages ([PRIOR-ART.md](PRIOR-ART.md)), and it's static Astro with no plugin system of its own.

What the kit takes from it:

- **Ship agent skills alongside the packages.** An `indie` skills package (Claude Code and Cowork plugin, Open Agent Skills format) with `setup`, `add-plugin` ("connect my Bluesky"), `doctor`, `upgrade`, `import` (from WordPress, Micro.blog, IndieKit or a Mastodon archive) and `migrate-content`. Each skill drives the same CLI commands as the docs (`bunx indie init`, `indie doctor`, `indie upgrade`), so the skills and the manual path never drift apart. This also suits this project, where most work is already done by agents.
- **MCP tools per plugin**, so an agent can post, edit and syndicate through the kit with the owner's Micropub scopes, as `@dwk/mcp` does ([PRIOR-ART.md](PRIOR-ART.md)).
- **Deploy-time safety checks.** Before each deploy, the platform plugin scans for leaked secrets and unexpected third-party scripts and blocks the deploy if it finds any, as Anglesite does. `indie doctor` runs the same checks.
- **Privacy defaults in the starter:** no cookies, no third-party JavaScript, and Cloudflare's cookieless analytics as the only analytics option offered.
- **Plain-language upkeep.** `indie doctor`'s output, and the owner-only `/indie/doctor` page, explain problems in words an owner can act on, not stack traces.

Where the kit and Anglesite meet:

- **Anglesite sites as a target.** An Anglesite site is static Astro on Workers. With the Astro frontend adapter and `platform-cloudflare`, it could add the kit for Micropub, Git-backed posting, threads, PESOS and backfeed, which Anglesite doesn't do today. That makes the Astro adapter more valuable, and a candidate to move earlier than Next.js.
- **Collaboration.** Alongside the "talk to neighbours" step before Phase 0, ask whether the kit's syndicators, importers and Git store would be welcome as packages Anglesite could use, and whether the two projects can share protocol packages instead of duplicating them.

## Layers, frontend adapters and adoption

Today this site is one SvelteKit app that does four jobs at once:

| Layer | Today, in this repo | In the kit |
| --- | --- | --- |
| **Frontend** (the public site: post pages, feeds, tag pages, h-entry markup) | `src/routes/[year]`, `posts`, `tags`, `type`, components in `src/lib/components/posts/` | Stays the owner's. Any framework. The kit supplies data loaders and head tags, never page designs. |
| **Owner UI** (composer, editor, syndicate page, account) | `src/routes/new`, `editor`, `…/syndicate`, `account`, `src/lib/components/composer/` | `ui-svelte`, which can be used two ways (below) |
| **API** (Micropub, media, IndieAuth, OAuth callbacks, `/api/*`) | `src/routes/micropub`, `auth`, `oauth`, `api`, `src/lib/server/publishing/` | The kit core and plugins, served through `kit.fetch` |
| **Deployment** (bindings, cron, previews) | `wrangler.jsonc`, `worker.mjs`, the five cron jobs | The platform plugin, plus an `indie` CLI that writes or checks the host config |

The kit keeps these separate, so each layer can change on its own.

### Frontend adapters

A frontend adapter does three small things: it mounts `kit.fetch` under the kit's paths, it gives the site's pages the posts in a form the framework understands, and it adds the discovery tags (`rel=micropub`, `authorization_endpoint`, `token_endpoint`, `webmention`, `hub`, `me` links, the h-card).

| Frontend | Mount | Content for pages | Head tags |
| --- | --- | --- | --- |
| SvelteKit (first) | `handle` hook | `loadPosts()`, `loadPost(path)`, `loadTags()` for `+page.server.ts` | `<IndieHead />` component |
| Astro | Integration with middleware | A content-collection loader | `<IndieHead />` Astro component |
| Next.js | `app/(indie)/[...path]/route.ts` | Server functions | `generateMetadata` helper |
| Eleventy, Hugo, Jekyll, any static site | **Sidecar**: the kit runs as its own small Worker or container on a subdomain | They keep reading Markdown from the repo, because the preset writes their layout | A snippet to paste into the base template |

### Owner UI, two ways

- **Embedded** (SvelteKit sites): import the Svelte components and put them on your own routes, in your own design system. This is how this site would use it.
- **Standalone** (every other frontend): the kit serves a prebuilt owner app at `/indie/` (composer, editor, syndicate page, settings). It's plain static assets plus the API, so an Astro, Next or Hugo site gets the full composer without installing Svelte. It can take a theme from CSS custom properties.

### Adoption: three ways in

**1. New site from the starter.**
`bun create indie` → choose platform, content repo and syndicators → deploy. The template is yours from then on (pages, CSS), and everything else is a package dependency.

**2. Drop into an existing framework site** (SvelteKit or Astro first):

```sh
bun add @indie/core @indie/adapter-sveltekit @indie/platform-vercel @indie/store-github @indie/syndicate-bluesky
bunx indie init      # writes indie.config.ts and checks the host config
```

```ts
// src/hooks.server.ts
import { indieHandle } from '@indie/adapter-sveltekit';
export const handle = indieHandle();        // or sequence(indieHandle(), yourHandle)
```

```svelte
<!-- src/routes/+layout.svelte -->
<IndieHead />
```

Posts written through Micropub land in the repo in the site's existing layout (the preset is set to match it). The site's pages read them as before, or switch to `loadPosts()`.

**3. Sidecar beside a static site** (Hugo, Eleventy, Jekyll, Neocities, GitHub Pages):
Deploy the "kit only" template with one button. It commits to the site's repo, and the static host rebuilds as usual, triggered by a build hook. Paste the head snippet into the base template. Nothing else in the site changes. This is how IndieKit is usually set up, so people coming from IndieKit know it.

### Keeping it updated

- **Code** lives in versioned packages, never copied into the site. Updating is `bun update @indie/*`, or merging the Renovate or Dependabot pull request that the starter turns on. The site's own pages and CSS are never touched by an update.
- **Breaking changes** come only in major versions, each with a changelog and, where possible, a codemod (`bunx indie upgrade`).
- **Stored state** (IndieAuth tokens, outbox, settings) carries a schema version. The platform plugin migrates it on first start after an update, the way the Durable Object migrations work today.
- **Content changes** never happen silently. If a new preset version changes how files are written, `bunx indie migrate-content` opens a pull request on the content repo, the way the HTML-to-Markdown conversion went through content PR 16.
- **Host config** drift is caught by `bunx indie doctor` (and the owner-only `/indie/doctor` page). It compares `wrangler.jsonc`, `vercel.json` or `netlify.toml` against what the enabled plugins need, such as a missing R2 bucket or a cron schedule that runs too rarely.
- **Sidecar and self-hosted installs** update by redeploying the kit-only template, by the Cloudron or YunoHost app update, or by pulling a new Docker tag.

### This site, before and after

| | Before | After |
| --- | --- | --- |
| Publishing code | About 7,000 lines in `src/lib/server/publishing/`, `indieauth/`, `backfeed.ts`, `webmentions.ts`, `websub.ts`, `buttondown*.ts` | Package dependencies plus a roughly 40-line `indie.config.ts` |
| API routes | `src/routes/micropub`, `auth`, `oauth/bluesky`, parts of `api/` | Gone. `indieHandle()` in `hooks.server.ts` serves them. The site-specific `api/` routes (tables, Are.na, Raindrop, insights, screenshots) stay. |
| Owner UI | Routes and components here | The same routes, now importing from `@indie/ui-svelte`, in this site's design system and Storybook |
| `worker.mjs` | Wraps SvelteKit and runs five cron jobs with minute arithmetic | `export default indieWorker(app)`, with plugins registering their own schedules |
| `wrangler.jsonc` | Hand-maintained bindings and `PUBLISHING_*` variables | The same file, checked by `indie doctor`. Variables become plugin settings, and only secrets stay in the environment. |
| Site-specific features | Mixed in with publishing code | All that's left in `src/`: library, wiki, tables, home graph, nav, theme |

## Packaging and distribution

- **Monorepo** with Bun workspaces: `packages/core`, `packages/platform-cloudflare`, `packages/platform-vercel`, `packages/store-github`, `packages/preset-markdown`, `packages/syndicate-*`, `packages/import-*`, `packages/ui-svelte`, `packages/create` and `templates/starter`.
- **npm** under one scope, ESM and TypeScript, versioned with Changesets. Core follows semver. Plugins start at `0.x`, as EmDash does.
- **One config file**, `indie.config.ts`:

  ```ts
  export default defineConfig({
    me: 'https://example.com/',
    timeZone: 'Europe/Berlin',
    identity: { name: 'Ada', photo: '/me.jpg', profiles: [...] },
    platform: cloudflare(),
    store: github({ repo: 'ada/site-content' }),
    preset: markdown({ paths: 'posts/{yyyy}/{MM}/{slug}.md' }),
    plugins: [mastodon(), bluesky(), webmention(), websub(), buttondown()]
  });
  ```

- **Why SvelteKit for the starter.** It has official adapters for Cloudflare, Vercel, Netlify and Node, which are exactly the four platforms. It prerenders static pages and handles server routes from one codebase, and this site already proves it. The core imports no framework, so an Astro or Eleventy starter can come later. Astro is popular with IndieWeb bloggers and is what EmDash uses, and it would only need a small adapter.
- **Starter template** (`templates/starter`): a plain SvelteKit site with h-entry and h-card templates, feeds, the composer, and the kit mounted. It has a Deploy to Cloudflare button, Deploy with Vercel and Deploy to Netlify buttons, a Docker image, and Cloudron and YunoHost packages, and `bun create indie` asks for domain, repo and platform.
- **Setup check.** A `/kit/doctor` page, owner only, runs IndieWebify-style checks (h-card, rel=me, endpoints discoverable, store writable, each plugin configured) and links each failure to the right settings panel.
- **Agent skills:** an `indie` Claude Code and Cowork plugin (Open Agent Skills format) for setup, adding plugins, doctor, upgrade and imports, on the same CLI as the docs. See [Learning from Anglesite](#learning-from-anglesite-an-agent-run-kit).
- **Docs:** one page per plugin, a plugin authoring guide, and each interface's contract test suite published as `@indie/testkit`, so third-party plugins can prove they conform.

## Extraction path

Each phase ships on its own and keeps caseyagollan.com working. The site is always the first consumer.

**Before Phase 0: talk to neighbours.** Contact IndieKit's maintainer and the author of davidwkeith/workers and Anglesite. The latter is a Workers-native IndieWeb package suite, unreleased, that covers much of our protocol core but not Git, POSSE or PESOS; see [PRIOR-ART.md](PRIOR-ART.md). Decide whether we build on its protocol packages and contribute the Git store and syndicators, or go alone.

**Phase 0: seams in place (in this repo, no new packages).**
Add `BlobStore`, `StateStore`, `ContentStore` and `Syndicator` interfaces under `src/lib/server/kit/`, and move every R2, Durable Object and GitHub call behind them. Move hard-coded identity, origin and timezone into one site config next to `SITE_IDENTITY`. Replace `worker.mjs`'s cron arithmetic with a task registry.
*Done when* no file outside the Cloudflare platform module mentions `R2Bucket` or `caseyagollan.com`, and tests and the production build pass unchanged.

**Phase 1: packages inside this repo.**
Create `packages/` as a Bun workspace. Move core, platform-cloudflare, store-github, preset-markdown, the Mastodon and Bluesky syndicators, the importers, webmention, WebSub and Buttondown. The site imports them by package name. Write the contract test suites as code moves.
*Done when* the site runs entirely on the packages and `packages/core` has no SvelteKit or Cloudflare import.

**Phase 2: a second site.**
Build `templates/starter` and deploy it to a throwaway domain on a separate Cloudflare account. Post with Quill, pass IndieWebify, syndicate to test accounts, and receive a Webmention.
*Done when* someone who isn't Casey could follow the README to a working site in under 30 minutes.

**Phase 3: Vercel, Netlify, Node and split deploys.**
Add `platform-vercel` (Blob, Upstash or Neon, Vercel Cron) and `platform-node` (SQLite, files, a Docker image) for local development, VMs and co-op hosts. Add the build-hook plugin kind for split deploys beside a static host. Add `platform-netlify` (Netlify Blobs for media and archives, scheduled functions for cron, edge or serverless functions for `kit.fetch`). If Blobs fails the conditional-write tests, the outbox, receipts and leases go in Netlify DB (Postgres) instead. Run every contract suite against all four platforms.
*Done when* the starter deploys on Vercel, Netlify and Docker with the same config apart from `platform:`, and a GitHub Pages site can publish through a kit running elsewhere.

**Phase 3b: self-hosting packages.**
Package the Docker build for Cloudron and YunoHost, plus a Co-op Cloud recipe. Test install, upgrade, backup and restore on each. Submit them to the catalogs once Phase 4 has published releases to point at.
*Done when* a fresh Cloudron and a fresh YunoHost server each get a working site from one install, and an upgrade keeps posts, tokens and settings.

**Phase 4: public release.**
Move `packages/` and `templates/` to their own repository (this site then depends on the published packages). Publish to npm with deploy buttons, docs, the testkit, and the IndieKit store and syndicator adapter. Announce on the IndieWeb wiki and in chat.

**Phase 5 (optional): sandboxed plugins.**
On Cloudflare paid plans, run third-party plugins in Dynamic Worker isolates and enforce their manifests. Trusted first-party plugins keep running in-process everywhere.

## Open questions for Casey

These go to Casey as choices in the project thread. The recommendations are what the plan above assumes.

1. **How to relate to IndieKit.** Decided 2026-11-17 (Casey): our own Workers-first kit with IndieKit's plugin shape, compatible at the protocol and content level, plus a later adapter for its store and syndicator plugins. Alternatives: contribute a Workers runtime to IndieKit itself, or build these as EmDash plugins.
2. **Where it lives first.** Decided 2026-11-17 (Casey): `packages/` inside this repo through Phase 3, then its own repo. The alternative is a new repo now, which makes development across both repos slower while the interfaces are still settling.
3. **How much UI to ship.** Decided 2026-11-17 (Casey): a headless core with an optional Svelte UI package and the SvelteKit starter. Alternatives: headless only (any Micropub client), or framework-neutral web components.
4. **Hosts after Cloudflare.** Decided 2026-11-17 (Casey): Vercel and Netlify, then Node/Docker for VMs, PaaS and co-op hosts, with Cloudron and YunoHost packages on top of it.
5. **Name and licence.** Not decided. MIT matches IndieKit and EmDash.
